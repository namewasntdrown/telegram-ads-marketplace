import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES, SchedulerJobData, ChannelStatsJobData, NotificationJobData, DEFAULT_JOB_OPTIONS, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';
import { DisputeReason } from '@tam/shared-types';
import { PrismaService } from '../prisma/prisma.service';
import { AdPosterService } from './ad-poster.processor';

// Deal expiry timeout (7 days for PENDING deals)
const PENDING_EXPIRY_DAYS = 7;
// Stuck scheduled deal timeout (24 hours past scheduled post time)
const STUCK_SCHEDULED_HOURS = 24;

const BOT_TOKEN = process.env.BOT_TOKEN;
const VERIFICATION_LOG_CHAT_ID = process.env.VERIFICATION_LOG_CHAT_ID;

@Processor(QUEUE_NAMES.SCHEDULER)
export class SchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private prisma: PrismaService,
    private adPosterService: AdPosterService,
    @InjectQueue(QUEUE_NAMES.SCHEDULER) private schedulerQueue: Queue,
    @InjectQueue(QUEUE_NAMES.CHANNEL_STATS) private channelStatsQueue: Queue<ChannelStatsJobData>,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue<NotificationJobData>,
  ) {
    super();
  }

  async onModuleInit() {
    // Schedule recurring jobs
    await this.scheduleRecurringJobs();
  }

  private async scheduleRecurringJobs() {
    // Check expired deals every 5 minutes
    await this.schedulerQueue.add(
      'check-expired-deals',
      { type: 'CHECK_EXPIRED_DEALS' },
      {
        repeat: { every: 5 * 60 * 1000 },
        removeOnComplete: true,
      }
    );

    // Check for scheduled posts every minute
    await this.schedulerQueue.add(
      'check-scheduled-posts',
      { type: 'CHECK_SCHEDULED_POSTS' },
      {
        repeat: { every: 60 * 1000 },
        removeOnComplete: true,
      }
    );

    // Check verification deadlines every 15 minutes
    await this.schedulerQueue.add(
      'check-verification-deadlines',
      { type: 'CHECK_VERIFICATION_DEADLINES' },
      {
        repeat: { every: 15 * 60 * 1000 },
        removeOnComplete: true,
      }
    );

    // Update channel stats every hour
    await this.schedulerQueue.add(
      'update-channel-stats',
      { type: 'UPDATE_CHANNEL_STATS' },
      {
        repeat: { every: 60 * 60 * 1000 }, // Every hour
        removeOnComplete: true,
      }
    );

    // Check appeal deadlines every 5 minutes
    await this.schedulerQueue.add(
      'check-appeal-deadlines',
      { type: 'CHECK_APPEAL_DEADLINES' },
      {
        repeat: { every: 5 * 60 * 1000 },
        removeOnComplete: true,
      }
    );

    this.logger.log('Recurring jobs scheduled');
  }

  async process(job: Job<SchedulerJobData>): Promise<void> {
    const { type } = job.data;

    switch (type) {
      case 'CHECK_EXPIRED_DEALS':
        await this.checkExpiredDeals();
        break;
      case 'CHECK_SCHEDULED_POSTS':
        await this.adPosterService.processScheduledPosts();
        break;
      case 'CHECK_VERIFICATION_DEADLINES':
        await this.checkVerificationDeadlines();
        break;
      case 'UPDATE_CHANNEL_STATS':
        await this.queueChannelStatsUpdates();
        break;
      case 'CHECK_APPEAL_DEADLINES':
        await this.checkAppealDeadlines();
        break;
      default:
        this.logger.warn(`Unknown scheduler job type: ${type}`);
    }
  }

  /**
   * Проверяет и истекает PENDING сделки старше 7 дней
   */
  private async checkExpiredDeals(): Promise<void> {
    const now = new Date();
    const expiryDate = new Date(now.getTime() - PENDING_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Find PENDING deals older than expiry date
    const expiredPendingDeals = await this.prisma.deal.findMany({
      where: {
        status: 'PENDING',
        createdAt: { lt: expiryDate },
      },
      include: { channel: { select: { title: true } } },
    });

    for (const deal of expiredPendingDeals) {
      await this.prisma.$transaction(async (tx) => {
        await tx.deal.update({
          where: { id: deal.id },
          data: { status: 'EXPIRED' },
        });

        await tx.dealStatusHistory.create({
          data: {
            dealId: deal.id,
            fromStatus: 'PENDING',
            toStatus: 'EXPIRED',
            reason: `Deal expired after ${PENDING_EXPIRY_DAYS} days without approval`,
          },
        });
      });

      this.logger.log(`Deal ${deal.id} expired (was PENDING for more than ${PENDING_EXPIRY_DAYS} days)`);

      this.notificationQueue.add('DEAL_EXPIRED', {
        type: 'DEAL_EXPIRED',
        recipientUserId: deal.advertiserId,
        data: {
          dealId: deal.id,
          channelId: deal.channelId,
          channelTitle: (deal as any).channel?.title,
          miniAppPath: `/deals/${deal.id}`,
        },
      }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
        this.logger.error(`Failed to queue DEAL_EXPIRED notification: ${e.message}`),
      );
    }

    // Check for stuck SCHEDULED deals (>24h past scheduledPostTime) — auto-cancel and refund
    await this.checkStuckScheduledDeals(now);

    this.logger.log(
      `Checked expired deals: ${expiredPendingDeals.length} PENDING deals expired`
    );
  }

  /**
   * Auto-cancels SCHEDULED deals stuck for more than 24 hours past scheduledPostTime.
   * Refunds frozen funds to advertiser balance.
   */
  private async checkStuckScheduledDeals(now: Date): Promise<void> {
    const stuckThreshold = new Date(now.getTime() - STUCK_SCHEDULED_HOURS * 60 * 60 * 1000);

    const stuckDeals = await this.prisma.deal.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledPostTime: { lt: stuckThreshold },
      },
      include: { channel: { select: { title: true } } },
    });

    if (stuckDeals.length === 0) return;

    this.logger.warn(`Found ${stuckDeals.length} stuck SCHEDULED deals (>24h). Auto-cancelling with refund.`);

    for (const deal of stuckDeals) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const totalFrozen = deal.amount.add(deal.platformFee);

          // Refund frozen funds to advertiser balance
          await tx.user.update({
            where: { id: deal.advertiserId },
            data: {
              frozenTon: { decrement: totalFrozen },
              balanceTon: { increment: totalFrozen },
            },
          });

          // Create refund transaction
          await tx.transaction.create({
            data: {
              amount: totalFrozen,
              type: 'ESCROW_REFUND',
              status: 'CONFIRMED',
              userId: deal.advertiserId,
              dealId: deal.id,
              metadata: {
                action: 'stuck_deal_refund',
                reason: `Deal stuck in SCHEDULED for >${STUCK_SCHEDULED_HOURS}h`,
              },
            },
          });

          // Cancel the deal
          await tx.deal.update({
            where: { id: deal.id },
            data: { status: 'CANCELLED' },
          });

          await tx.dealStatusHistory.create({
            data: {
              dealId: deal.id,
              fromStatus: 'SCHEDULED',
              toStatus: 'CANCELLED',
              reason: `Auto-cancelled: deal stuck for >${STUCK_SCHEDULED_HOURS}h past scheduled time. Funds refunded.`,
            },
          });
        });

        this.logger.log(`Auto-cancelled stuck deal ${deal.id} and refunded ${deal.amount.add(deal.platformFee)} TON`);

        // Notify both parties
        const notifData = {
          dealId: deal.id,
          channelId: deal.channelId,
          channelTitle: (deal as any).channel?.title,
          reason: 'Deal auto-cancelled: posting failed for over 24 hours',
          miniAppPath: `/deals/${deal.id}`,
        };

        for (const uid of [deal.advertiserId, deal.channelOwnerId]) {
          this.notificationQueue.add('DEAL_CANCELLED', {
            type: 'DEAL_CANCELLED',
            recipientUserId: uid,
            data: notifData,
          }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
            this.logger.error(`Failed to queue stuck deal notification: ${e.message}`),
          );
        }
      } catch (error) {
        this.logger.error(`Error auto-cancelling stuck deal ${deal.id}:`, error);
      }
    }
  }

  /**
   * Proactively checks POSTED deals approaching verification deadline.
   * Verifies post existence and auto-disputes if post was deleted early.
   */
  private async checkVerificationDeadlines(): Promise<void> {
    if (!BOT_TOKEN || !VERIFICATION_LOG_CHAT_ID) {
      this.logger.log('Skipping verification deadlines check: BOT_TOKEN or VERIFICATION_LOG_CHAT_ID not configured');
      return;
    }

    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    // Find POSTED deals where verificationDeadline is within the next 2 hours
    const deals = await this.prisma.deal.findMany({
      where: {
        status: 'POSTED',
        verificationDeadline: {
          gt: now,
          lte: twoHoursFromNow,
        },
        postMessageId: { not: null },
      },
      include: { channel: { select: { title: true, telegramId: true } } },
      take: 20,
    });

    if (deals.length === 0) return;

    this.logger.log(`Checking ${deals.length} deals approaching verification deadline`);

    for (const deal of deals) {
      const channel = (deal as any).channel;
      const chatId = channel?.telegramId ? Number(channel.telegramId) : null;

      if (!chatId || !deal.postMessageId) continue;

      try {
        const verification = await this.verifyPostViaForward(chatId, deal.postMessageId);

        // Save view count if available
        if (verification.views != null) {
          await this.prisma.deal.update({
            where: { id: deal.id },
            data: { viewsAtVerification: verification.views },
          });
          this.logger.log(`Deal ${deal.id}: recorded ${verification.views} views at verification`);
        }

        if (!verification.exists) {
          this.logger.warn(`Post deleted early for deal ${deal.id}, auto-disputing`);

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
                reason: 'Post deleted before verification deadline (proactive check)',
              },
            });
          });

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
        }
      } catch (error) {
        this.logger.error(`Error verifying post for deal ${deal.id}:`, error);
      }

      // Small delay between verification checks to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * Verifies post exists by forwarding to log chat and immediately deleting.
   * Also extracts the view count from the forwarded channel post.
   */
  private async verifyPostViaForward(chatId: number, messageId: number): Promise<{ exists: boolean; views?: number }> {
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
        result?: { message_id: number; views?: number; forward_origin?: { type: string; chat?: { id: number } } };
        description?: string;
      };

      if (result.ok && result.result) {
        const views = result.result.views;

        // Clean up forwarded message
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

      return { exists: false };
    } catch (error) {
      this.logger.error(`Forward verification error: ${error}`);
      return { exists: true }; // On network error, assume post exists
    }
  }

  /**
   * Checks appeal deadlines and unfreezes funds when the 48h window expires
   * without a PENDING appeal being filed.
   */
  private async checkAppealDeadlines(): Promise<void> {
    const now = new Date();

    // Find deals where appealDeadline has passed and there is no PENDING appeal
    const expiredDeals = await this.prisma.deal.findMany({
      where: {
        appealDeadline: { lt: now, not: null },
      },
      include: {
        channel: { select: { title: true } },
      },
    });

    if (expiredDeals.length === 0) return;

    for (const deal of expiredDeals) {
      try {
        // Check if there's a PENDING appeal for this deal
        const pendingAppeal = await this.prisma.appeal.findFirst({
          where: {
            dealId: deal.id,
            type: 'DEAL_DISPUTE_RESOLUTION',
            status: 'PENDING',
          },
        });

        // If there's a pending appeal, don't expire the deadline
        if (pendingAppeal) continue;

        // Determine who received the funds and unfreeze
        const netAmount = deal.amount.sub(deal.platformFee);
        const totalFrozen = deal.amount.add(deal.platformFee);

        await this.prisma.$transaction(async (tx) => {
          if (deal.status === 'RELEASED') {
            // Channel owner received funds, unfreeze netAmount
            await tx.user.update({
              where: { id: deal.channelOwnerId },
              data: { appealFrozenTon: { decrement: netAmount } },
            });
          } else if (deal.status === 'REFUNDED') {
            // Advertiser received refund, unfreeze totalFrozen
            await tx.user.update({
              where: { id: deal.advertiserId },
              data: { appealFrozenTon: { decrement: totalFrozen } },
            });
          }

          // Clear the appeal deadline
          await tx.deal.update({
            where: { id: deal.id },
            data: { appealDeadline: null },
          });
        });

        this.logger.log(`Appeal window expired for deal ${deal.id}, funds unfrozen`);

        // Notify the recipient that funds are now available
        const recipientId = deal.status === 'RELEASED'
          ? deal.channelOwnerId
          : deal.advertiserId;

        this.notificationQueue.add('APPEAL_WINDOW_EXPIRED', {
          type: 'APPEAL_WINDOW_EXPIRED',
          recipientUserId: recipientId,
          data: {
            dealId: deal.id,
            channelId: deal.channelId,
            channelTitle: (deal as any).channel?.title,
            miniAppPath: `/deals/${deal.id}`,
          },
        }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
          this.logger.error(`Failed to queue APPEAL_WINDOW_EXPIRED notification: ${e.message}`),
        );
      } catch (error) {
        this.logger.error(`Error processing appeal deadline for deal ${deal.id}:`, error);
      }
    }

    this.logger.log(`Checked appeal deadlines: ${expiredDeals.length} deals processed`);
  }

  /**
   * Queues stats update jobs for all active channels
   */
  private async queueChannelStatsUpdates(): Promise<void> {
    const activeChannels = await this.prisma.channel.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        username: true,
        telegramId: true,
      },
    });

    for (const channel of activeChannels) {
      // Skip channels with placeholder telegramId (negative values)
      if (channel.telegramId < 0) {
        continue;
      }

      const telegramChannelId = channel.username
        ? `@${channel.username}`
        : channel.telegramId.toString();

      await this.channelStatsQueue.add(
        'periodic-stats-update',
        {
          channelId: channel.id,
          telegramChannelId,
        },
        {
          ...DEFAULT_JOB_OPTIONS,
          // Add small delay between jobs to avoid rate limiting
          delay: activeChannels.indexOf(channel) * 1000,
        }
      );
    }

    this.logger.log(`Queued stats updates for ${activeChannels.length} channels`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Scheduler job ${job.id} failed: ${error.message}`);
  }
}
