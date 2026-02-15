import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TonWalletService as TonWallet } from '@tam/ton-utils';

@Injectable()
export class TonWalletService implements OnModuleInit {
  private readonly logger = new Logger(TonWalletService.name);
  private wallet: TonWallet | null = null;
  private initialized = false;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const mnemonic = this.configService.get<string>('TON_MASTER_WALLET_MNEMONIC');
    const network = this.configService.get<string>('TON_NETWORK') as 'mainnet' | 'testnet';
    const apiKey = this.configService.get<string>('TON_API_KEY');

    if (!mnemonic) {
      this.logger.warn('TON_MASTER_WALLET_MNEMONIC not configured');
      return;
    }

    try {
      this.wallet = new TonWallet({
        network: network ?? 'testnet',
        mnemonic,
        apiKey,
      });

      const address = await this.wallet.initialize();
      this.initialized = true;
      this.logger.log(`TON wallet initialized: ${address.toString()}`);
    } catch (error) {
      this.logger.error('Failed to initialize TON wallet', error);
    }
  }

  isInitialized(): boolean {
    return this.initialized;
  }

  async sendTon(
    toAddress: string,
    amount: string,
    memo?: string
  ): Promise<{ success: boolean; hash?: string; error?: string }> {
    if (!this.wallet) {
      throw new Error('TON wallet not initialized');
    }
    return this.wallet.sendTon(toAddress, amount, memo);
  }

  async verifyDeposit(
    expectedMemo: string,
    expectedAmount: string,
    sinceTimestamp: number
  ): Promise<{
    found: boolean;
    transaction?: {
      hash: string;
      amount: string;
      from: string;
    };
  }> {
    if (!this.wallet) {
      throw new Error('TON wallet not initialized');
    }
    return this.wallet.verifyDeposit(expectedMemo, expectedAmount, sinceTimestamp);
  }
}
