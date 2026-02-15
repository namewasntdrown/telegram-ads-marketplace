import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  QUEUE_NAMES,
  DepositWatcherJobData,
} from '@tam/queue-contracts';
import { TransactionStatus } from '@tam/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TonWalletService } from '../ton-wallet/ton-wallet.service';
import { Prisma } from '@tam/prisma-client';

@Processor(QUEUE_NAMES.DEPOSIT_WATCHER)
export class DepositWatcherProcessor extends WorkerHost {
  private readonly logger = new Logger(DepositWatcherProcessor.name);

  constructor(
    private prisma: PrismaService,
    private tonWallet: TonWalletService
  ) {
    super();
  }

  async process(job: Job<DepositWatcherJobData>): Promise<void> {
    const { depositAddressId, userId, memo, expectedAmount, createdAt, expiresAt } =
      job.data;

    this.logger.log(
      `Processing deposit watch: ${depositAddressId} (attempt ${job.attemptsMade + 1})`
    );

    // Check if already confirmed (avoid double-processing)
    const depositAddress = await this.prisma.depositAddress.findUnique({
      where: { id: depositAddressId },
    });

    if (depositAddress && !depositAddress.isActive) {
      this.logger.log(`Deposit ${depositAddressId} already processed, skipping`);
      return;
    }

    // Check if expired
    if (Date.now() > expiresAt) {
      this.logger.log(`Deposit ${depositAddressId} expired`);
      await this.handleExpiredDeposit(depositAddressId);
      return;
    }

    // Check for deposit on chain
    const result = await this.tonWallet.verifyDeposit(
      memo,
      expectedAmount,
      Math.floor(createdAt / 1000)
    );

    if (result.found && result.transaction) {
      await this.handleSuccessfulDeposit(
        depositAddressId,
        userId,
        result.transaction.amount,
        result.transaction.hash
      );
    } else {
      // Re-queue for later check via retry
      throw new Error('Deposit not found yet, will retry');
    }
  }

  private async handleSuccessfulDeposit(
    depositAddressId: string,
    userId: string,
    amount: string,
    txHash: string
  ): Promise<void> {
    this.logger.log(`Deposit confirmed: ${txHash} for ${amount} TON`);

    await this.prisma.$transaction(async (tx) => {
      // Update deposit address
      await tx.depositAddress.update({
        where: { id: depositAddressId },
        data: { isActive: false },
      });

      // Find pending transaction
      const pendingTx = await tx.transaction.findFirst({
        where: {
          userId,
          status: TransactionStatus.PENDING,
          type: 'DEPOSIT',
          metadata: {
            path: ['depositAddressId'],
            equals: depositAddressId,
          },
        },
      });

      if (pendingTx) {
        const amountDecimal = new Prisma.Decimal(amount);

        // Update transaction
        await tx.transaction.update({
          where: { id: pendingTx.id },
          data: {
            status: TransactionStatus.CONFIRMED,
            tonTxHash: txHash,
            amount: amountDecimal,
          },
        });

        // Update user balance (use Decimal for precision)
        await tx.user.update({
          where: { id: userId },
          data: {
            balanceTon: { increment: amountDecimal },
          },
        });

      }
    });
  }

  private async handleExpiredDeposit(depositAddressId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.depositAddress.update({
        where: { id: depositAddressId },
        data: { isActive: false },
      });

      await tx.transaction.updateMany({
        where: {
          status: TransactionStatus.PENDING,
          type: 'DEPOSIT',
          metadata: {
            path: ['depositAddressId'],
            equals: depositAddressId,
          },
        },
        data: {
          status: TransactionStatus.FAILED,
        },
      });
    });
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.warn(
      `Job ${job.id} failed (attempt ${job.attemptsMade}): ${error.message}`
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Job ${job.id} completed`);
  }
}
