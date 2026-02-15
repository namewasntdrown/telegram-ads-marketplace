import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ChannelsController } from './channels.controller';
import { ChannelsService } from './channels.service';
import { ChannelAdminsService } from './channel-admins.service';
import { MtprotoAuthService } from './mtproto-auth.service';
import { TelegramBotService } from '../../common/services/telegram-bot.service';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({
      name: QUEUE_NAMES.CHANNEL_STATS,
    }),
    NotificationModule,
  ],
  controllers: [ChannelsController],
  providers: [ChannelsService, ChannelAdminsService, MtprotoAuthService, TelegramBotService],
  exports: [ChannelsService, ChannelAdminsService],
})
export class ChannelsModule {}
