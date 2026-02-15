import { Module } from '@nestjs/common';
import { TonWalletService } from './ton-wallet.service';

@Module({
  providers: [TonWalletService],
  exports: [TonWalletService],
})
export class TonWalletModule {}
