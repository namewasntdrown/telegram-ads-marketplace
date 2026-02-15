import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger, OnModuleInit } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { QUEUE_NAMES, SchedulerJobData, ChannelStatsJobData, NotificationJobData, DEFAULT_JOB_OPTIONS, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';
import { PrismaService } from '../prisma/prisma.service';

// Deal expiry timeout (7 days for PENDING deals)
const PENDING_EXPIRY_DAYS = 7;

@Processor(QUEUE_NAMES.SCHEDULER)
export class SchedulerProcessor extends WorkerHost implements OnModuleInit {
  private readonly logger = new Logger(SchedulerProcessor.name);

  constructor(
    private prisma: PrismaService,
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

    // Update channel stats every hour
    await this.schedulerQueue.add(
      'update-channel-stats',
      { type: 'UPDATE_CHANNEL_STATS' },
      {
        repeat: { every: 60 * 60 * 1000 }, // Every hour
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
        // Handled by ad-poster.processor
        break;
      case 'UPDATE_CHANNEL_STATS':
        await this.queueChannelStatsUpdates();
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

    // Also check for SCHEDULED deals that failed to post (stuck for more than 1 hour after scheduled time)
    const stuckScheduledDeals = await this.prisma.deal.findMany({
      where: {
        status: 'SCHEDULED',
        scheduledPostTime: { lt: new Date(now.getTime() - 60 * 60 * 1000) }, // More than 1 hour ago
      },
    });

    if (stuckScheduledDeals.length > 0) {
      this.logger.warn(`Found ${stuckScheduledDeals.length} stuck SCHEDULED deals. These may need manual intervention.`);
    }

    this.logger.log(
      `Checked expired deals: ${expiredPendingDeals.length} PENDING deals expired`
    );
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
