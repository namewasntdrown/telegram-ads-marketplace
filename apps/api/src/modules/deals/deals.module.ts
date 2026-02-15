import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealMessagesService } from './deal-messages.service';
import { DealStateMachine } from './state-machine/deal-state.machine';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationModule } from '../../common/notification/notification.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [EscrowModule, NotificationModule, ChannelsModule],
  controllers: [DealsController],
  providers: [DealsService, DealMessagesService, DealStateMachine],
  exports: [DealsService, DealStateMachine],
})
export class DealsModule {}
