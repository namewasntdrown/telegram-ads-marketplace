import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PLATFORM_FEE_PERCENT, DisputeReason } from '@tam/shared-types';
import { QUEUE_NAMES, NotificationJobData, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';

const BOT_TOKEN = process.env.BOT_TOKEN;
const VERIFICATION_LOG_CHAT_ID = process.env.VERIFICATION_LOG_CHAT_ID;

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
   * Verifies that a post still exists in the channel by attempting to forward it
   * to a log chat. Returns true if post exists, false if deleted.
   */
  async verifyPostExists(chatId: number | string, messageId: number): Promise<{ exists: boolean; views?: number }> {
    if (!BOT_TOKEN || !VERIFICATION_LOG_CHAT_ID) {
      this.logger.warn('BOT_TOKEN or VERIFICATION_LOG_CHAT_ID not configured, skipping post verification');
      return { exists: true };
    }

    try {
      const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/forwardMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: VERIFICATION_LOG_CHAT_ID,
          from_chat_id: chatId,
          message_id: messageId,
        }),
      });

      const result = await response.json() as {
        ok: boolean;
        result?: { message_id: number; views?: number };
        description?: string;
      };

      if (result.ok && result.result) {
        const views = result.result.views;

        // Post exists — delete the forwarded message from log chat
        await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/deleteMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: VERIFICATION_LOG_CHAT_ID,
            message_id: result.result.message_id,
          }),
        }).catch(() => { /* non-critical */ });

        return { exists: true, views };
      }

      this.logger.warn(`Post verification failed for chat ${chatId} message ${messageId}: ${result.description}`);
      return { exists: false };
    } catch (error) {
      this.logger.error(`Post verification error: ${error}`);
      return { exists: true }; // On network error, default to trusting the post exists
    }
  }

  /**
   * Обрабатывает POSTED сделки, у которых истёк verificationDeadline
   * Verifies post still exists, then releases funds or auto-disputes
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
      include: { channel: { select: { title: true, telegramId: true } } },
      take: 10,
    });

    this.logger.log(`Found ${deals.length} deals ready for release`);

    for (const deal of deals) {
      this.logger.log(`Processing deal ${deal.id}...`);

      try {
        // Verify post still exists before releasing funds
        if (deal.postMessageId) {
          const channel = (deal as any).channel;
          const chatId = channel?.telegramId ? Number(channel.telegramId) : null;

          if (chatId) {
            const verification = await this.verifyPostExists(chatId, deal.postMessageId);

            // Save final view count before release
            if (verification.views != null) {
              await this.prisma.deal.update({
                where: { id: deal.id },
                data: { viewsAtVerification: verification.views },
              });
              this.logger.log(`Deal ${deal.id}: final views at release = ${verification.views}`);
            }

            if (!verification.exists) {
              this.logger.warn(`Post deleted for deal ${deal.id}, auto-disputing`);

              await this.prisma.$transaction(async (tx) => {
                await tx.deal.update({
                  where: { id: deal.id },
                  data: {
                    status: 'DISPUTED',
                    disputeReason: DisputeReason.EARLY_DELETION,
                    disputeDescription: 'Automatically disputed: the ad post was deleted from the channel before the verification period ended.',
                  },
                });

                await tx.dealStatusHistory.create({
                  data: {
                    dealId: deal.id,
                    fromStatus: 'POSTED',
                    toStatus: 'DISPUTED',
                    reason: 'Post deleted before verification deadline (auto-detected)',
                  },
                });
              });

              // Notify both parties
              for (const uid of [deal.channelOwnerId, deal.advertiserId]) {
                this.notificationQueue.add('DEAL_DISPUTED', {
                  type: 'DEAL_DISPUTED',
                  recipientUserId: uid,
                  data: {
                    dealId: deal.id,
                    channelId: deal.channelId,
                    channelTitle: channel?.title,
                    reason: 'Post deleted before verification deadline',
                    miniAppPath: `/deals/${deal.id}`,
                  },
                }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
                  this.logger.error(`Failed to queue dispute notification: ${e.message}`),
                );
              }

              continue; // Skip release for this deal
            }
          }
        }

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

          // Update campaign spentBudget
          await tx.campaign.update({
            where: { id: deal.campaignId },
            data: { spentBudget: { increment: dealAmount } },
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

        // Check if campaign budget is running low (>=80% spent)
        try {
          const campaign = await this.prisma.campaign.findUnique({
            where: { id: deal.campaignId },
            select: { id: true, title: true, totalBudget: true, spentBudget: true, advertiserId: true },
          });
          if (campaign && campaign.totalBudget.greaterThan(0)) {
            const spentPercent = campaign.spentBudget.div(campaign.totalBudget).mul(100).toNumber();
            if (spentPercent >= 80) {
              const remaining = 100 - Math.round(spentPercent);
              this.notificationQueue.add('CAMPAIGN_BUDGET_LOW', {
                type: 'CAMPAIGN_BUDGET_LOW',
                recipientUserId: campaign.advertiserId,
                data: {
                  campaignId: campaign.id,
                  campaignTitle: campaign.title,
                  budgetPercentRemaining: remaining,
                  miniAppPath: `/campaigns/${campaign.id}`,
                },
              }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
                this.logger.error(`Failed to queue budget low notification: ${e.message}`),
              );
            }
          }
        } catch (e) {
          this.logger.error(`Error checking campaign budget: ${e}`);
        }

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
