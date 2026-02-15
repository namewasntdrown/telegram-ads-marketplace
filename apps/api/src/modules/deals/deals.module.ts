import { Module } from '@nestjs/common';
import { DealsController } from './deals.controller';
import { DealsService } from './deals.service';
import { DealStateMachine } from './state-machine/deal-state.machine';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [EscrowModule, NotificationModule],
  controllers: [DealsController],
  providers: [DealsService, DealStateMachine],
  exports: [DealsService, DealStateMachine],
})
export class DealsModule {}
