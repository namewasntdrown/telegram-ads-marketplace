import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { QUEUE_NAMES } from '@tam/queue-contracts';
import { EscrowController } from './escrow.controller';
import { EscrowService } from './escrow.service';
import { TonWalletService } from './ton-wallet.service';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: QUEUE_NAMES.WITHDRAWAL_PROCESSOR },
      { name: QUEUE_NAMES.DEPOSIT_WATCHER },
    ),
  ],
  controllers: [EscrowController],
  providers: [EscrowService, TonWalletService],
  exports: [EscrowService, TonWalletService],
})
export class EscrowModule {}
