import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TonWalletService } from './ton-wallet.service';
import {
  MIN_DEPOSIT_TON,
  MIN_WITHDRAWAL_TON,
  DEPOSIT_EXPIRY_MS,
  DAILY_WITHDRAWAL_LIMIT_TON,
  TransactionType,
  TransactionStatus,
} from '@tam/shared-types';
import { generateDepositMemo } from '@tam/ton-utils';
import {
  QUEUE_NAMES,
  CRITICAL_JOB_OPTIONS,
  DEFAULT_JOB_OPTIONS,
  WithdrawalJobData,
  DepositWatcherJobData,
} from '@tam/queue-contracts';
import {
  DepositRequestDto,
  DepositResponseDto,
  WithdrawResponseDto,
  BalanceResponseDto,
  TransactionHistoryDto,
  PaginatedTransactionsDto,
} from './dto/escrow.dto';
import { Prisma } from '@tam/prisma-client';

@Injectable()
export class EscrowService {
  private readonly logger = new Logger(EscrowService.name);

  constructor(
    private prisma: PrismaService,
    private tonWallet: TonWalletService,
    @InjectQueue(QUEUE_NAMES.WITHDRAWAL_PROCESSOR)
    private withdrawalQueue: Queue<WithdrawalJobData>,
    @InjectQueue(QUEUE_NAMES.DEPOSIT_WATCHER)
    private depositWatcherQueue: Queue<DepositWatcherJobData>,
  ) {}

  async createDepositAddress(
    userId: string,
    dto: DepositRequestDto
  ): Promise<DepositResponseDto> {
    const amount = new Prisma.Decimal(dto.amount);
    const minDeposit = new Prisma.Decimal(MIN_DEPOSIT_TON);

    if (amount.lessThan(minDeposit)) {
      throw new BadRequestException(
        `Minimum deposit amount is ${MIN_DEPOSIT_TON} TON`
      );
    }

    if (!this.tonWallet.hasDepositAddress()) {
      throw new BadRequestException('TON wallet service not available. Configure TON_MASTER_WALLET_MNEMONIC or TON_MASTER_WALLET_ADDRESS.');
    }

    // Generate unique memo
    const memo = generateDepositMemo(userId);

    // Calculate expiry
    const expiresAt = new Date(Date.now() + DEPOSIT_EXPIRY_MS);

    // Create deposit address record
    const depositAddress = await this.prisma.depositAddress.create({
      data: {
        address: this.tonWallet.getMasterAddress(),
        memo,
        userId,
        expiresAt,
      },
    });

    // Create pending transaction
    await this.prisma.transaction.create({
      data: {
        amount: new Prisma.Decimal(dto.amount),
        type: TransactionType.DEPOSIT,
        status: TransactionStatus.PENDING,
        userId,
        dealId: dto.dealId,
        metadata: {
          depositAddressId: depositAddress.id,
          memo,
        },
      },
    });

    // Enqueue deposit watcher job only if wallet is fully initialized
    // (fallback address mode can't auto-verify deposits)
    if (this.tonWallet.isInitialized()) {
      const now = Date.now();
      await this.depositWatcherQueue.add(
        `deposit-${depositAddress.id}`,
        {
          depositAddressId: depositAddress.id,
          userId,
          memo,
          expectedAmount: dto.amount,
          createdAt: now,
          expiresAt: expiresAt.getTime(),
        },
        {
          ...DEFAULT_JOB_OPTIONS,
          delay: 30_000, // Start checking after 30 seconds
          attempts: 60,  // Retry up to 60 times (covers ~30 min with backoff)
          backoff: {
            type: 'fixed',
            delay: 30_000, // Check every 30 seconds
          },
        },
      );

      this.logger.log(`Deposit watcher job enqueued for ${depositAddress.id}`);
    } else {
      this.logger.warn(
        `Deposit ${depositAddress.id} created with fallback address. Auto-verification disabled — configure TON_MASTER_WALLET_MNEMONIC for auto-confirmation.`,
      );
    }

    return {
      address: depositAddress.address,
      memo: depositAddress.memo,
      amount: dto.amount,
      expiresAt: expiresAt.toISOString(),
      depositAddressId: depositAddress.id,
    };
  }

  async getBalance(userId: string): Promise<BalanceResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Use Decimal arithmetic for precision
    const total = user.balanceTon.add(user.frozenTon);
    const withdrawable = user.balanceTon.sub(user.appealFrozenTon);

    return {
      available: user.balanceTon.toString(),
      frozen: user.frozenTon.toString(),
      total: total.toString(),
      appealFrozen: user.appealFrozenTon.toString(),
      withdrawable: withdrawable.toString(),
    };
  }

  async getTransactionHistory(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<PaginatedTransactionsDto> {
    const skip = (page - 1) * limit;

    const [transactions, total] = await Promise.all([
      this.prisma.transaction.findMany({
        where: { userId },
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.transaction.count({ where: { userId } }),
    ]);

    return {
      items: transactions.map((tx) => ({
        id: tx.id,
        tonTxHash: tx.tonTxHash ?? undefined,
        amount: tx.amount.toString(),
        type: tx.type,
        status: tx.status,
        dealId: tx.dealId ?? undefined,
        createdAt: tx.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Get the status of a specific deposit by its depositAddress ID.
   */
  async getDepositStatus(
    userId: string,
    depositAddressId: string,
  ): Promise<{
    status: 'pending' | 'confirming' | 'completed' | 'expired' | 'failed';
    txHash?: string;
    amount?: string;
  }> {
    const depositAddress = await this.prisma.depositAddress.findUnique({
      where: { id: depositAddressId },
    });

    if (!depositAddress || depositAddress.userId !== userId) {
      throw new NotFoundException('Deposit not found');
    }

    // Find the associated transaction
    const transaction = await this.prisma.transaction.findFirst({
      where: {
        userId,
        type: TransactionType.DEPOSIT,
        metadata: {
          path: ['depositAddressId'],
          equals: depositAddressId,
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!transaction) {
      throw new NotFoundException('Deposit transaction not found');
    }

    // Check if expired
    if (
      depositAddress.expiresAt < new Date() &&
      transaction.status === TransactionStatus.PENDING
    ) {
      return { status: 'expired' };
    }

    const statusMap: Record<string, 'pending' | 'confirming' | 'completed' | 'failed'> = {
      PENDING: 'pending',
      CONFIRMED: 'completed',
      FAILED: 'failed',
    };

    return {
      status: statusMap[transaction.status] ?? 'pending',
      txHash: transaction.tonTxHash ?? undefined,
      amount: transaction.amount.toString(),
    };
  }

  /**
   * Create a withdrawal using the user's connected wallet address.
   * No need to specify toAddress - it's taken from user.walletAddress.
   */
  async createWithdrawal(
    userId: string,
    amount: string,
  ): Promise<WithdrawResponseDto> {
    const amountDecimal = new Prisma.Decimal(amount);
    const minWithdrawal = new Prisma.Decimal(MIN_WITHDRAWAL_TON);

    if (amountDecimal.lessThan(minWithdrawal)) {
      throw new BadRequestException(
        `Minimum withdrawal amount is ${MIN_WITHDRAWAL_TON} TON`,
      );
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.walletAddress) {
      throw new BadRequestException(
        'Please connect your wallet before withdrawing',
      );
    }

    const withdrawable = user.balanceTon.sub(user.appealFrozenTon);
    if (withdrawable.lessThan(amountDecimal)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Daily withdrawal limit check (10 TON per day by default)
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const dailyWithdrawals = await this.prisma.transaction.aggregate({
      where: {
        userId,
        type: TransactionType.WITHDRAWAL,
        createdAt: { gte: todayStart },
        status: { not: TransactionStatus.FAILED },
      },
      _sum: { amount: true },
    });

    const dailyTotal = dailyWithdrawals._sum.amount ?? new Prisma.Decimal(0);
    const dailyLimit = new Prisma.Decimal(DAILY_WITHDRAWAL_LIMIT_TON);
    if (new Prisma.Decimal(dailyTotal.toString()).add(amountDecimal).greaterThan(dailyLimit)) {
      throw new BadRequestException('Daily withdrawal limit exceeded');
    }

    this.logger.log(
      `Creating withdrawal: ${amount} TON for user ${userId} to ${user.walletAddress.slice(0, 10)}...`,
    );

    const transaction = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: { balanceTon: { decrement: amountDecimal } },
      });

      return tx.transaction.create({
        data: {
          amount: amountDecimal,
          type: TransactionType.WITHDRAWAL,
          status: TransactionStatus.PENDING,
          userId,
          metadata: { toAddress: user.walletAddress },
        },
      });
    });

    // Enqueue withdrawal job for background processing
    await this.withdrawalQueue.add(
      `withdrawal-${transaction.id}`,
      {
        transactionId: transaction.id,
        userId,
        toAddress: user.walletAddress,
        amount,
      },
      CRITICAL_JOB_OPTIONS,
    );

    this.logger.log(`Withdrawal job enqueued for transaction ${transaction.id}`);

    return {
      transactionId: transaction.id,
      status: 'PENDING',
      estimatedTime: '5-10 minutes',
    };
  }

  /**
   * Get withdrawal status by transaction ID.
   */
  async getWithdrawalStatus(
    userId: string,
    transactionId: string,
  ): Promise<{
    status: 'pending' | 'processing' | 'sent' | 'completed' | 'failed';
    txHash?: string;
    failReason?: string;
  }> {
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction || transaction.userId !== userId) {
      throw new NotFoundException('Withdrawal not found');
    }

    if (transaction.type !== TransactionType.WITHDRAWAL) {
      throw new BadRequestException('Not a withdrawal transaction');
    }

    const metadata = (transaction.metadata as Record<string, unknown>) ?? {};

    // Determine detailed status:
    // PENDING + toAddress in metadata means job was queued → 'processing'
    // PENDING without metadata → 'pending' (should not happen normally)
    // CONFIRMED → 'completed'
    // FAILED → 'failed'
    let status: 'pending' | 'processing' | 'sent' | 'completed' | 'failed';
    if (transaction.status === TransactionStatus.CONFIRMED) {
      status = 'completed';
    } else if (transaction.status === TransactionStatus.FAILED) {
      status = 'failed';
    } else if (metadata.toAddress) {
      status = 'processing';
    } else {
      status = 'pending';
    }

    return {
      status,
      txHash: transaction.tonTxHash ?? undefined,
      failReason: (metadata.error as string) ?? undefined,
    };
  }

  async lockFundsForDeal(
    userId: string,
    dealId: string,
    amount: string
  ): Promise<void> {
    const amountDecimal = new Prisma.Decimal(amount);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
      });

      if (!user || user.balanceTon.lessThan(amountDecimal)) {
        throw new BadRequestException('Insufficient balance');
      }

      // Move from balance to frozen (use Decimal for precision)
      await tx.user.update({
        where: { id: userId },
        data: {
          balanceTon: { decrement: amountDecimal },
          frozenTon: { increment: amountDecimal },
        },
      });

      // Record escrow lock transaction
      await tx.transaction.create({
        data: {
          amount: new Prisma.Decimal(amount),
          type: TransactionType.ESCROW_LOCK,
          status: TransactionStatus.CONFIRMED,
          userId,
          dealId,
        },
      });
    });
  }

  async releaseFundsFromDeal(
    dealId: string,
    fromUserId: string,
    toUserId: string,
    amount: string,
    fee: string
  ): Promise<void> {
    const amountDecimal = new Prisma.Decimal(amount);
    const feeDecimal = new Prisma.Decimal(fee);
    const netAmount = amountDecimal.sub(feeDecimal);

    await this.prisma.$transaction(async (tx) => {
      // Unfreeze from sender
      await tx.user.update({
        where: { id: fromUserId },
        data: {
          frozenTon: { decrement: amountDecimal },
        },
      });

      // Add to recipient balance
      await tx.user.update({
        where: { id: toUserId },
        data: {
          balanceTon: { increment: netAmount },
        },
      });

      // Record escrow release
      await tx.transaction.create({
        data: {
          amount: netAmount,
          type: TransactionType.ESCROW_RELEASE,
          status: TransactionStatus.CONFIRMED,
          userId: toUserId,
          dealId,
        },
      });

      // Record platform fee
      if (feeDecimal.greaterThan(0)) {
        await tx.transaction.create({
          data: {
            amount: feeDecimal,
            type: TransactionType.FEE,
            status: TransactionStatus.CONFIRMED,
            userId: fromUserId,
            dealId,
          },
        });
      }
    });
  }

  async refundFundsFromDeal(
    dealId: string,
    userId: string,
    amount: string
  ): Promise<void> {
    const amountDecimal = new Prisma.Decimal(amount);

    await this.prisma.$transaction(async (tx) => {
      // Move from frozen back to balance (use Decimal for precision)
      await tx.user.update({
        where: { id: userId },
        data: {
          frozenTon: { decrement: amountDecimal },
          balanceTon: { increment: amountDecimal },
        },
      });

      // Record refund
      await tx.transaction.create({
        data: {
          amount: new Prisma.Decimal(amount),
          type: TransactionType.ESCROW_REFUND,
          status: TransactionStatus.CONFIRMED,
          userId,
          dealId,
        },
      });
    });
  }
}
