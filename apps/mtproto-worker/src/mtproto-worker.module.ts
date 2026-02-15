import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { PrismaModule } from './prisma/prisma.module';
import { TelegramClientService } from './services/telegram-client.service';
import { ChannelStatsService } from './services/channel-stats.service';
import { PostVerificationService } from './services/post-verification.service';
import { AutopostService } from './services/autopost.service';
import { FolderSyncService } from './services/folder-sync.service';
import { StatsSchedulerService } from './services/stats-scheduler.service';
import { ChannelStatsProcessor } from './processors/channel-stats.processor';
import { PostVerificationProcessor } from './processors/post-verification.processor';
import { AutopostProcessor } from './processors/autopost.processor';
import { FolderSyncController } from './controllers/folder-sync.controller';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get('REDIS_HOST', 'localhost'),
          port: configService.get('REDIS_PORT', 6379),
          password: configService.get('REDIS_PASSWORD'),
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.CHANNEL_STATS },
      { name: QUEUE_NAMES.POST_VERIFICATION },
      { name: QUEUE_NAMES.AUTOPOST }
    ),
    PrismaModule,
  ],
  controllers: [FolderSyncController],
  providers: [
    TelegramClientService,
    ChannelStatsService,
    PostVerificationService,
    AutopostService,
    FolderSyncService,
    StatsSchedulerService,
    ChannelStatsProcessor,
    PostVerificationProcessor,
    AutopostProcessor,
  ],
})
export class MtprotoWorkerModule {}
