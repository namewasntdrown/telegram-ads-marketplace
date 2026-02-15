import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramClientService } from './telegram-client.service';

@Injectable()
export class StatsSchedulerService implements OnModuleInit {
  private readonly logger = new Logger(StatsSchedulerService.name);
  private updateInterval: NodeJS.Timeout | null = null;

  // Update stats every 6 hours
  private readonly UPDATE_INTERVAL_MS = 6 * 60 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private telegramClient: TelegramClientService,
    @InjectQueue(QUEUE_NAMES.CHANNEL_STATS) private channelStatsQueue: Queue
  ) {}

  async onModuleInit() {
    // Wait a bit for Telegram client to initialize
    setTimeout(() => this.startScheduler(), 10000);
  }

  private startScheduler() {
    this.logger.log('Starting channel stats scheduler');

    // Run immediately on startup
    this.scheduleStatsUpdate();

    // Then run every 6 hours
    this.updateInterval = setInterval(() => {
      this.scheduleStatsUpdate();
    }, this.UPDATE_INTERVAL_MS);

    this.logger.log(
      `Channel stats will be updated every ${this.UPDATE_INTERVAL_MS / 1000 / 60 / 60} hours`
    );
  }

  private async scheduleStatsUpdate() {
    if (!this.telegramClient.isInitialized()) {
      this.logger.warn('Telegram client not ready, skipping scheduled update');
      return;
    }

    try {
      const channels = await this.prisma.channel.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true, username: true, telegramId: true, title: true },
      });

      this.logger.log(
        `Scheduling stats update for ${channels.length} active channels`
      );

      for (const channel of channels) {
        const telegramChannelId = channel.username
          ? `@${channel.username}`
          : channel.telegramId.toString();

        await this.channelStatsQueue.add(
          'scheduled-stats-update',
          {
            channelId: channel.id,
            telegramChannelId,
          },
          {
            // Spread jobs over time to avoid rate limiting
            delay: channels.indexOf(channel) * 2000,
            removeOnComplete: true,
            removeOnFail: false,
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 5000,
            },
          }
        );
      }

      this.logger.log(`Queued ${channels.length} channel stats updates`);
    } catch (error) {
      this.logger.error(`Failed to schedule stats update: ${error}`);
    }
  }

  onModuleDestroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
    }
  }
}
