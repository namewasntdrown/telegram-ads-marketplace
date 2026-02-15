import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TonWalletService as TonWallet } from '@tam/ton-utils';

@Injectable()
export class TonWalletService implements OnModuleInit {
  private readonly logger = new Logger(TonWalletService.name);
  private wallet: TonWallet | null = null;
  private initialized = false;
  private fallbackAddress: string | null = null;

  constructor(private configService: ConfigService) {}

  async onModuleInit() {
    await this.initialize();
  }

  private async initialize(): Promise<void> {
    const mnemonic = this.configService.get<string>('TON_MASTER_WALLET_MNEMONIC');
    const network = this.configService.get<string>('TON_NETWORK') as 'mainnet' | 'testnet';
    const apiKey = this.configService.get<string>('TON_API_KEY');
    const fallbackAddr = this.configService.get<string>('TON_MASTER_WALLET_ADDRESS');

    if (fallbackAddr) {
      this.fallbackAddress = fallbackAddr;
    }

    if (!mnemonic) {
      if (fallbackAddr) {
        this.logger.warn(
          'TON_MASTER_WALLET_MNEMONIC not configured. ' +
          'Deposits will show address from TON_MASTER_WALLET_ADDRESS, but withdrawals and auto-verification are disabled.',
        );
      } else {
        this.logger.warn('TON_MASTER_WALLET_MNEMONIC and TON_MASTER_WALLET_ADDRESS not configured, TON features disabled');
      }
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

  /**
   * Returns true if the wallet is fully initialized (can send/verify).
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  /**
   * Returns true if at least the deposit address is available
   * (either from mnemonic or fallback TON_MASTER_WALLET_ADDRESS).
   */
  hasDepositAddress(): boolean {
    return this.initialized || this.fallbackAddress !== null;
  }

  getMasterAddress(): string {
    if (this.wallet) {
      return this.wallet.getAddressString();
    }
    if (this.fallbackAddress) {
      return this.fallbackAddress;
    }
    throw new Error('TON wallet not initialized and no fallback address configured');
  }

  async getBalance(): Promise<string> {
    if (!this.wallet) {
      throw new Error('TON wallet not initialized');
    }
    return this.wallet.getBalance();
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

  async findTransactionByMemo(
    memo: string,
    sinceTimestamp: number
  ): Promise<{
    hash: string;
    amount: string;
    from: string;
    timestamp: number;
  } | null> {
    if (!this.wallet) {
      throw new Error('TON wallet not initialized');
    }

    const tx = await this.wallet.findTransactionByMemo(memo, sinceTimestamp);
    if (!tx) {
      return null;
    }

    return {
      hash: tx.hash,
      amount: tx.amount,
      from: tx.from,
      timestamp: tx.timestamp,
    };
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
