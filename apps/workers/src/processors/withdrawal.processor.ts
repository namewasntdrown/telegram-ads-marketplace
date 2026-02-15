import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, WithdrawalJobData } from '@tam/queue-contracts';
import { TransactionStatus } from '@tam/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { TonWalletService } from '../ton-wallet/ton-wallet.service';
import { Prisma } from '@tam/prisma-client';

@Processor(QUEUE_NAMES.WITHDRAWAL_PROCESSOR)
export class WithdrawalProcessor extends WorkerHost {
  private readonly logger = new Logger(WithdrawalProcessor.name);

  constructor(
    private prisma: PrismaService,
    private tonWallet: TonWalletService
  ) {
    super();
  }

  async process(job: Job<WithdrawalJobData>): Promise<void> {
    const { transactionId, userId, toAddress, amount } = job.data;

    this.logger.log(
      `Processing withdrawal: ${transactionId} - ${amount} TON to ${toAddress} (attempt ${job.attemptsMade + 1})`
    );

    // Verify transaction is still PENDING (avoid double-processing)
    const transaction = await this.prisma.transaction.findUnique({
      where: { id: transactionId },
    });

    if (!transaction || transaction.status !== TransactionStatus.PENDING) {
      this.logger.warn(
        `Withdrawal ${transactionId} is no longer PENDING (status: ${transaction?.status}), skipping`
      );
      return;
    }

    if (!this.tonWallet.isInitialized()) {
      throw new Error('TON wallet not initialized');
    }

    // Send TON
    const result = await this.tonWallet.sendTon(
      toAddress,
      amount,
      `Withdrawal ${transactionId.slice(0, 8)}`
    );

    if (result.success && result.hash) {
      // Update transaction as confirmed
      await this.prisma.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.CONFIRMED,
          tonTxHash: result.hash,
        },
      });

      this.logger.log(`Withdrawal ${transactionId} confirmed: ${result.hash}`);
    } else {
      // Only handle as final failure on last attempt
      if (job.attemptsMade + 1 >= (job.opts.attempts ?? 5)) {
        await this.handleFailedWithdrawal(transactionId, userId, amount, result.error);
      }
      throw new Error(result.error ?? 'Withdrawal failed');
    }
  }

  private async handleFailedWithdrawal(
    transactionId: string,
    userId: string,
    amount: string,
    error?: string
  ): Promise<void> {
    const amountDecimal = new Prisma.Decimal(amount);

    await this.prisma.$transaction(async (tx) => {
      // Mark transaction as failed
      await tx.transaction.update({
        where: { id: transactionId },
        data: {
          status: TransactionStatus.FAILED,
          metadata: {
            error: error ?? 'Unknown error',
            failedAt: new Date().toISOString(),
          },
        },
      });

      // Refund user balance (use Decimal for precision)
      await tx.user.update({
        where: { id: userId },
        data: {
          balanceTon: { increment: amountDecimal },
        },
      });
    });

    this.logger.error(`Withdrawal ${transactionId} failed permanently: ${error}`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Withdrawal job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts ?? '?'}): ${error.message}`
    );
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    this.logger.log(`Withdrawal job ${job.id} completed successfully`);
  }
}
