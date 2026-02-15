import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { NotificationService } from './notification.service';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.NOTIFICATION }),
  ],
  providers: [NotificationService],
  exports: [NotificationService],
})
export class NotificationModule {}
