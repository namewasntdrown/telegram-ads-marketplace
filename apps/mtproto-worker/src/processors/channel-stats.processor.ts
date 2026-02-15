import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, ChannelStatsJobData } from '@tam/queue-contracts';
import { ChannelStatsService } from '../services/channel-stats.service';

@Processor(QUEUE_NAMES.CHANNEL_STATS)
export class ChannelStatsProcessor extends WorkerHost {
  private readonly logger = new Logger(ChannelStatsProcessor.name);

  constructor(private channelStatsService: ChannelStatsService) {
    super();
  }

  async process(job: Job<ChannelStatsJobData>): Promise<void> {
    const { channelId, telegramChannelId } = job.data;

    // Handle different job types
    if (job.name === 'verify-channel-admin') {
      this.logger.log(`Verifying channel admin: ${channelId}`);
      const verified = await this.channelStatsService.verifyChannelAdmin(
        channelId,
        telegramChannelId
      );
      this.logger.log(
        `Channel ${channelId} verification: ${verified ? 'SUCCESS' : 'FAILED'}`
      );
      return;
    }

    // Default: update channel stats
    this.logger.log(`Processing channel stats: ${channelId}`);

    const result = await this.channelStatsService.updateChannelStats(
      channelId,
      telegramChannelId
    );

    if (!result) {
      throw new Error(`Failed to update stats for channel ${channelId}`);
    }

    this.logger.log(
      `Channel ${channelId} stats updated: ${result.subscriberCount} subs, ${result.avgViews} avg views`
    );
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(`Channel stats job ${job.id} failed: ${error.message}`);
  }
}
