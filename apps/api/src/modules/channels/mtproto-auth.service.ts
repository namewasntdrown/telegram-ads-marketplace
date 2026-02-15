import {
  Injectable,
  Logger,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@tam/prisma-client';

/**
 * Service for managing channel verification status.
 *
 * The verification model uses sha6kii (platform's MTProto account) as a shared admin.
 * Channel owners add sha6kii as admin to their channel, then request verification via
 * the /channels/:id/verify endpoint. The MTProto worker checks if sha6kii is an admin
 * and marks the channel as verified.
 *
 * This service handles revoking verification status.
 */
@Injectable()
export class MtprotoAuthService {
  private readonly logger = new Logger(MtprotoAuthService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Remove verification status from channel.
   * This will clear the verified badge and all verified statistics.
   */
  async removeSession(channelId: string, userId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to manage this channel');
    }

    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        isVerified: false,
        verifiedAt: null,
        hasVerifiedStats: false,
        languageStats: Prisma.DbNull,
        premiumStats: Prisma.DbNull,
        viewSourceStats: Prisma.DbNull,
        lastStatsUpdate: null,
      },
    });

    this.logger.log(`Removed verification status for channel ${channelId}`);
  }
}
