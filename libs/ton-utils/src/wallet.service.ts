import {
  TonClient,
  WalletContractV4,
  internal,
  Address,
  toNano,
  fromNano,
  Cell,
  SendMode,
} from '@ton/ton';
import { mnemonicToPrivateKey, mnemonicNew } from '@ton/crypto';
import { KeyPair } from '@ton/crypto';

export interface WalletConfig {
  network: 'mainnet' | 'testnet';
  mnemonic: string;
  apiKey?: string;
}

export interface TransactionInfo {
  hash: string;
  lt: string;
  from: string;
  to: string;
  amount: string;
  memo?: string;
  timestamp: number;
  success: boolean;
}

export interface SendResult {
  success: boolean;
  hash?: string;
  error?: string;
}

export class TonWalletService {
  private client: TonClient;
  private wallet: WalletContractV4 | null = null;
  private keyPair: KeyPair | null = null;
  private walletAddress: Address | null = null;
  private network: 'mainnet' | 'testnet';
  private initialized = false;

  constructor(config: WalletConfig) {
    this.network = config.network;

    const endpoint =
      config.network === 'mainnet'
        ? 'https://toncenter.com/api/v2/jsonRPC'
        : 'https://testnet.toncenter.com/api/v2/jsonRPC';

    this.client = new TonClient(
      config.apiKey
        ? { endpoint, apiKey: config.apiKey }
        : { endpoint }
    );

    // Store mnemonic temporarily for initialization
    // It will be cleared after initialize() is called
    this._tempMnemonic = config.mnemonic;
  }

  // Temporary storage - cleared after initialization
  private _tempMnemonic: string | null = null;

  async initialize(): Promise<Address> {
    if (this.initialized) {
      return this.walletAddress!;
    }

    if (!this._tempMnemonic) {
      throw new Error('Mnemonic not available - wallet may have already been initialized');
    }

    const mnemonic = this._tempMnemonic.split(' ');
    this.keyPair = await mnemonicToPrivateKey(mnemonic);

    // SECURITY: Clear mnemonic from memory immediately after deriving keys
    // The keyPair is sufficient for all operations
    this._tempMnemonic = null;

    this.wallet = WalletContractV4.create({
      publicKey: this.keyPair.publicKey,
      workchain: 0,
    });

    this.walletAddress = this.wallet.address;
    this.initialized = true;

    return this.walletAddress;
  }

  getAddress(): Address {
    if (!this.walletAddress) {
      throw new Error('Wallet not initialized');
    }
    return this.walletAddress;
  }

  getAddressString(): string {
    return this.getAddress().toString({
      bounceable: false,
      testOnly: this.network === 'testnet',
    });
  }

  async getBalance(): Promise<string> {
    const balance = await this.client.getBalance(this.getAddress());
    return fromNano(balance);
  }

  async sendTon(
    toAddress: string,
    amount: string,
    memo?: string
  ): Promise<SendResult> {
    if (!this.wallet || !this.keyPair) {
      throw new Error('Wallet not initialized');
    }

    try {
      const destination = Address.parse(toAddress);
      const seqno = await this.getSeqno();

      let body: Cell | undefined;
      if (memo) {
        // Create comment cell for memo
        const builder = new Cell().asBuilder();
        builder.storeUint(0, 32); // op = 0 for comment
        builder.storeStringTail(memo);
        body = builder.endCell();
      }

      const contract = this.client.open(this.wallet);

      await contract.sendTransfer({
        seqno,
        secretKey: this.keyPair.secretKey,
        messages: [
          internal({
            to: destination,
            value: toNano(amount),
            body,
            bounce: false,
          }),
        ],
        sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
      });

      // Wait for transaction to be confirmed
      const hash = await this.waitForSeqnoChange(seqno);

      return { success: true, hash };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Send failed',
      };
    }
  }

  private async getSeqno(): Promise<number> {
    if (!this.wallet) {
      throw new Error('Wallet not initialized');
    }

    const contract = this.client.open(this.wallet);

    try {
      return await contract.getSeqno();
    } catch {
      return 0;
    }
  }

  private async waitForSeqnoChange(
    currentSeqno: number,
    maxAttempts: number = 30
  ): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      await this.sleep(2000);
      const newSeqno = await this.getSeqno();
      if (newSeqno > currentSeqno) {
        // Get last transaction hash
        const transactions = await this.getTransactions(1);
        return transactions[0]?.hash ?? 'unknown';
      }
    }
    throw new Error('Transaction confirmation timeout');
  }

  async getTransactions(limit: number = 10): Promise<TransactionInfo[]> {
    const transactions = await this.client.getTransactions(
      this.getAddress(),
      { limit }
    );

    return transactions.map((tx) => {
      const inMsg = tx.inMessage;
      let from = '';
      let amount = '0';
      let memo: string | undefined;

      if (inMsg?.info.type === 'internal') {
        from = inMsg.info.src.toString();
        amount = fromNano(inMsg.info.value.coins);

        // Try to parse memo from body
        if (inMsg.body) {
          try {
            const slice = inMsg.body.beginParse();
            const op = slice.loadUint(32);
            if (op === 0) {
              memo = slice.loadStringTail();
            }
          } catch {
            // No valid memo
          }
        }
      }

      const result: TransactionInfo = {
        hash: tx.hash().toString('hex'),
        lt: tx.lt.toString(),
        from,
        to: this.getAddressString(),
        amount,
        timestamp: tx.now,
        success: tx.description.type === 'generic',
      };

      // Only add memo if it exists (exactOptionalPropertyTypes compliance)
      if (memo !== undefined) {
        result.memo = memo;
      }

      return result;
    });
  }

  async findTransactionByMemo(
    memo: string,
    sinceTimestamp: number
  ): Promise<TransactionInfo | null> {
    const transactions = await this.getTransactions(50);

    for (const tx of transactions) {
      if (tx.timestamp < sinceTimestamp) {
        break;
      }
      if (tx.memo === memo) {
        return tx;
      }
    }

    return null;
  }

  async verifyDeposit(
    expectedMemo: string,
    expectedAmount: string,
    sinceTimestamp: number
  ): Promise<{ found: boolean; transaction?: TransactionInfo }> {
    const tx = await this.findTransactionByMemo(expectedMemo, sinceTimestamp);

    if (!tx) {
      return { found: false };
    }

    // Use BigInt for precise financial calculations (amounts in nano)
    // Convert from TON to nanoTON (multiply by 10^9)
    const toNanoSafe = (ton: string): bigint => {
      const parts = ton.split('.');
      const whole = parts[0] || '0';
      const frac = (parts[1] || '').padEnd(9, '0').slice(0, 9);
      return BigInt(whole) * BigInt(1_000_000_000) + BigInt(frac);
    };

    const receivedNano = toNanoSafe(tx.amount);
    const expectedNano = toNanoSafe(expectedAmount);

    // Allow 1% tolerance for fees (99% of expected amount)
    const minRequired = (expectedNano * BigInt(99)) / BigInt(100);

    if (receivedNano >= minRequired) {
      return { found: true, transaction: tx };
    }

    return { found: false };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  static async generateMnemonic(): Promise<string[]> {
    return mnemonicNew(24);
  }

  static async getAddressFromMnemonic(
    mnemonic: string[],
    network: 'mainnet' | 'testnet'
  ): Promise<string> {
    const keyPair = await mnemonicToPrivateKey(mnemonic);
    const wallet = WalletContractV4.create({
      publicKey: keyPair.publicKey,
      workchain: 0,
    });

    return wallet.address.toString({
      bounceable: false,
      testOnly: network === 'testnet',
    });
  }
}
