import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  verifyTonProof,
  TonProofPayload,
} from '@tam/ton-utils';

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  /**
   * Connect a wallet to a user account with TON Proof verification.
   * Uses row-level locking to prevent race conditions.
   */
  async connectWallet(
    userId: string,
    proofPayload: TonProofPayload,
  ): Promise<{ walletAddress: string }> {
    const miniAppUrl = this.configService.get<string>('MINI_APP_URL', '');
    if (!miniAppUrl) {
      throw new BadRequestException('MINI_APP_URL not configured');
    }

    this.logger.log(
      `Connecting wallet for user ${userId}, domain in proof: ${proofPayload.proof?.domain?.value}, allowed: ${miniAppUrl}`,
    );

    // Verify the TON proof
    const result = await verifyTonProof(proofPayload, {
      allowedDomain: miniAppUrl,
      maxAgeSeconds: 300, // 5 minutes
    });

    if (!result.valid || !result.address) {
      this.logger.warn(
        `TON Proof verification failed for user ${userId}: ${result.error}`,
      );
      throw new BadRequestException(
        result.error ?? 'TON Proof verification failed',
      );
    }

    const walletAddress = result.address;

    // Use transaction with row-level locking to prevent race conditions
    return this.prisma.$transaction(async (tx) => {
      // Check if this wallet is already connected to another user
      // Using raw query for SELECT ... FOR UPDATE
      const existingUsers = await tx.$queryRaw<
        Array<{ id: string; walletAddress: string | null }>
      >`SELECT id, "walletAddress" FROM "User" WHERE "walletAddress" = ${walletAddress} FOR UPDATE`;

      const existingUser = existingUsers[0];
      if (existingUser && existingUser.id !== userId) {
        throw new ConflictException('WALLET_ALREADY_CONNECTED');
      }

      // Lock the current user row
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;

      // Update the user's wallet address
      await tx.user.update({
        where: { id: userId },
        data: { walletAddress },
      });

      this.logger.log(
        `Wallet ${walletAddress.slice(0, 10)}... connected to user ${userId}`,
      );

      return { walletAddress };
    });
  }

  /**
   * Disconnect wallet from user account.
   * Does NOT delete transaction history.
   */
  async disconnectWallet(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (!user.walletAddress) {
      throw new BadRequestException('No wallet connected');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { walletAddress: null },
    });

    this.logger.log(`Wallet disconnected for user ${userId}`);
  }
}
