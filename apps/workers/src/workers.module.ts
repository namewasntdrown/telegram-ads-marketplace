import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ScheduleModule } from '@nestjs/schedule';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { PrismaModule } from './prisma/prisma.module';
import { DepositWatcherProcessor } from './processors/deposit-watcher.processor';
import { SchedulerProcessor } from './processors/scheduler.processor';
import { WithdrawalProcessor } from './processors/withdrawal.processor';
import { EscrowReleaseService } from './processors/escrow-release.processor';
import { NotificationProcessor } from './processors/notification.processor';
import { TonWalletModule } from './ton-wallet/ton-wallet.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ScheduleModule.forRoot(),
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
      { name: QUEUE_NAMES.DEPOSIT_WATCHER },
      { name: QUEUE_NAMES.WITHDRAWAL_PROCESSOR },
      { name: QUEUE_NAMES.SCHEDULER },
      { name: QUEUE_NAMES.CHANNEL_STATS },
      { name: QUEUE_NAMES.NOTIFICATION }
    ),
    PrismaModule,
    TonWalletModule,
  ],
  providers: [
    DepositWatcherProcessor,
    SchedulerProcessor,
    WithdrawalProcessor,
    EscrowReleaseService,
    NotificationProcessor,
  ],
})
export class WorkersModule {}
