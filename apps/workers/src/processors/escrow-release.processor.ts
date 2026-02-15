import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_FEE_PERCENT } from '@tam/shared-types';
import { QUEUE_NAMES, NotificationJobData, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';

@Injectable()
export class EscrowReleaseService {
  private readonly logger = new Logger(EscrowReleaseService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue<NotificationJobData>,
  ) {}

  @Interval(60000)
  async processAll(): Promise<void> {
    await this.processEscrowRelease();
    await this.processFolderPlacementEscrowRelease();
  }

  /**
   * Обрабатывает POSTED сделки, у которых истёк verificationDeadline
   * Автоматически выплачивает средства владельцу канала
   */
  private async processEscrowRelease(): Promise<void> {
    this.logger.log('Starting escrow release processor...');

    const now = new Date();

    // Find deals that are POSTED and past verification deadline
    const deals = await this.prisma.deal.findMany({
      where: {
        status: 'POSTED',
        verificationDeadline: { lte: now },
      },
      include: { channel: { select: { title: true } } },
      take: 10,
    });

    this.logger.log(`Found ${deals.length} deals ready for release`);

    for (const deal of deals) {
      this.logger.log(`Processing deal ${deal.id}...`);

      try {
        await this.prisma.$transaction(async (tx) => {
          const channelOwnerId = deal.channelOwnerId;
          const advertiserId = deal.advertiserId;
          const dealAmount = deal.amount;
          const platformFee = deal.platformFee;
          const totalFrozen = dealAmount.add(platformFee);
          const payoutAmount = dealAmount; // Channel owner gets deal amount (fee goes to platform)

          // Get advertiser to verify frozen funds
          const advertiser = await tx.user.findUnique({
            where: { id: advertiserId },
            select: { frozenTon: true },
          });

          if (!advertiser || advertiser.frozenTon.lessThan(totalFrozen)) {
            throw new Error(`Insufficient frozen funds for advertiser ${advertiserId}`);
          }

          // Deduct from advertiser's frozen balance
          await tx.user.update({
            where: { id: advertiserId },
            data: {
              frozenTon: { decrement: totalFrozen },
            },
          });

          // Add payout to channel owner's balance
          await tx.user.update({
            where: { id: channelOwnerId },
            data: {
              balanceTon: { increment: payoutAmount },
            },
          });

          // Create release transaction for channel owner
          await tx.transaction.create({
            data: {
              amount: payoutAmount,
              type: 'ESCROW_RELEASE',
              status: 'CONFIRMED',
              userId: channelOwnerId,
              dealId: deal.id,
              metadata: {
                action: 'payout_received',
                fromUserId: advertiserId,
              },
            },
          });

          // Create fee transaction (for platform accounting)
          if (platformFee.greaterThan(0)) {
            await tx.transaction.create({
              data: {
                amount: platformFee,
                type: 'FEE',
                status: 'CONFIRMED',
                userId: advertiserId,
                dealId: deal.id,
                metadata: {
                  action: 'platform_fee',
                  feePercent: PLATFORM_FEE_PERCENT,
                },
              },
            });
          }

          // Update deal status to RELEASED
          await tx.deal.update({
            where: { id: deal.id },
            data: { status: 'RELEASED' },
          });

          // Record status change
          await tx.dealStatusHistory.create({
            data: {
              dealId: deal.id,
              fromStatus: 'POSTED',
              toStatus: 'RELEASED',
              reason: 'Funds released after verification period',
            },
          });
        });

        this.logger.log(`Successfully released funds for deal ${deal.id}. Paid ${deal.amount} TON to channel owner.`);

        const notifData = {
          dealId: deal.id,
          channelId: deal.channelId,
          channelTitle: (deal as any).channel?.title,
          amount: deal.amount.toString(),
          miniAppPath: `/deals/${deal.id}`,
        };

        for (const uid of [deal.channelOwnerId, deal.advertiserId]) {
          this.notificationQueue.add('DEAL_AUTO_RELEASED', {
            type: 'DEAL_AUTO_RELEASED',
            recipientUserId: uid,
            data: notifData,
          }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
            this.logger.error(`Failed to queue notification: ${e.message}`),
          );
        }
      } catch (error) {
        this.logger.error(`Error releasing funds for deal ${deal.id}:`, error);
      }
    }
  }

  /**
   * Обрабатывает APPROVED размещения в папках, у которых истёк escrowReleaseAt
   * Автоматически выплачивает средства владельцу папки
   */
  private async processFolderPlacementEscrowRelease(): Promise<void> {
    this.logger.log('Starting folder placement escrow release...');

    const now = new Date();

    // Find placements that are APPROVED and past escrow release date
    const placements = await this.prisma.folderPlacement.findMany({
      where: {
        status: 'APPROVED',
        escrowReleaseAt: { lte: now },
      },
      include: { folder: { select: { title: true } } },
      take: 10,
    });

    this.logger.log(`Found ${placements.length} placements ready for release`);

    for (const placement of placements) {
      this.logger.log(`Processing placement ${placement.id}...`);

      try {
        await this.prisma.$transaction(async (tx) => {
          const channelOwnerId = placement.channelOwnerId;
          const folderOwnerId = placement.folderOwnerId;
          const amount = placement.amount;
          const platformFee = placement.platformFee;
          const totalFrozen = amount.add(platformFee);

          // Get channel owner to verify frozen funds
          const channelOwner = await tx.user.findUnique({
            where: { id: channelOwnerId },
            select: { frozenTon: true },
          });

          if (!channelOwner || channelOwner.frozenTon.lessThan(totalFrozen)) {
            throw new Error(`Insufficient frozen funds for channel owner ${channelOwnerId}`);
          }

          // 1. Deduct from channel owner's frozen balance
          await tx.user.update({
            where: { id: channelOwnerId },
            data: {
              frozenTon: { decrement: totalFrozen },
            },
          });

          // 2. Add payout to folder owner's balance
          await tx.user.update({
            where: { id: folderOwnerId },
            data: {
              balanceTon: { increment: amount },
            },
          });

          // 3. Create FOLDER_PLACEMENT transaction for folder owner
          await tx.transaction.create({
            data: {
              amount: amount,
              type: 'FOLDER_PLACEMENT',
              status: 'CONFIRMED',
              userId: folderOwnerId,
              folderPlacementId: placement.id,
              metadata: {
                folderId: placement.folderId,
                channelId: placement.channelId,
                channelOwnerId: channelOwnerId,
                action: 'escrow_released',
              },
            },
          });

          // 4. Create FEE transaction for platform
          if (platformFee.greaterThan(0)) {
            await tx.transaction.create({
              data: {
                amount: platformFee,
                type: 'FEE',
                status: 'CONFIRMED',
                userId: channelOwnerId,
                folderPlacementId: placement.id,
                metadata: {
                  feeType: 'FOLDER_PLACEMENT',
                  folderId: placement.folderId,
                  channelId: placement.channelId,
                },
              },
            });
          }

          // 5. Update placement status to COMPLETED
          await tx.folderPlacement.update({
            where: { id: placement.id },
            data: {
              status: 'COMPLETED',
              completedAt: now,
            },
          });
        });

        this.logger.log(`Released ${placement.amount} TON to folder owner for placement ${placement.id}`);

        const folderTitle = (placement as any).folder?.title;
        const placementNotifData = {
          folderTitle,
          amount: placement.amount.toString(),
          miniAppPath: `/folder-placements/${placement.id}`,
        };

        for (const uid of [placement.folderOwnerId, placement.channelOwnerId]) {
          this.notificationQueue.add('DEAL_AUTO_RELEASED', {
            type: 'DEAL_AUTO_RELEASED',
            recipientUserId: uid,
            data: placementNotifData,
          }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
            this.logger.error(`Failed to queue notification: ${e.message}`),
          );
        }
      } catch (error) {
        this.logger.error(`Error releasing funds for placement ${placement.id}:`, error);
      }
    }
  }
}
