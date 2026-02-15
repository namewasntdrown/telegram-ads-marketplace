import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpdateUserDto, UserResponseDto, UserStatsDto } from './dto/user.dto';
import { DealStatus } from '@tam/shared-types';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(private prisma: PrismaService) {}

  async findById(id: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.mapToResponse(user);
  }

  async update(id: string, dto: UpdateUserDto): Promise<UserResponseDto> {
    // Security: Check if user has balance before allowing wallet change
    if (dto.walletAddress) {
      const existingUser = await this.prisma.user.findUnique({
        where: { id },
      });

      if (!existingUser) {
        throw new NotFoundException('User not found');
      }

      // Prevent wallet change if user has any balance (security measure)
      const hasBalance =
        existingUser.balanceTon.greaterThan(0) ||
        existingUser.frozenTon.greaterThan(0);

      if (hasBalance && existingUser.walletAddress !== dto.walletAddress) {
        // If wallet is already set and different, require withdrawal first
        if (existingUser.walletAddress) {
          throw new BadRequestException(
            'Cannot change wallet address while you have balance. Withdraw funds first.'
          );
        }
      }

      // Log wallet changes for audit
      this.logger.log(
        `User ${id} setting wallet: ${dto.walletAddress?.slice(0, 10)}...`
      );
    }

    const user = await this.prisma.user.update({
      where: { id },
      data: {
        walletAddress: dto.walletAddress,
      },
    });

    return this.mapToResponse(user);
  }

  async getStats(id: string): Promise<UserStatsDto> {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            channels: true,
            campaigns: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Get deal statistics
    const dealStats = await this.prisma.deal.groupBy({
      by: ['status'],
      where: {
        OR: [{ advertiserId: id }, { channelOwnerId: id }],
      },
      _count: true,
    });

    const activeStatuses: DealStatus[] = [
      DealStatus.AWAITING_DEPOSIT,
      DealStatus.FUNDED,
      DealStatus.CONTENT_PENDING,
      DealStatus.CONTENT_SUBMITTED,
      DealStatus.CONTENT_APPROVED,
      DealStatus.POSTED,
      DealStatus.AWAITING_VERIFICATION,
    ];

    let totalDeals = 0;
    let activeDeals = 0;
    let completedDeals = 0;

    for (const stat of dealStats) {
      totalDeals += stat._count;
      if (activeStatuses.includes(stat.status as DealStatus)) {
        activeDeals += stat._count;
      }
      if (stat.status === DealStatus.RELEASED || stat.status === DealStatus.VERIFIED) {
        completedDeals += stat._count;
      }
    }

    // Calculate totals
    const spentDeals = await this.prisma.deal.aggregate({
      where: {
        advertiserId: id,
        status: { in: [DealStatus.RELEASED, DealStatus.VERIFIED] },
      },
      _sum: { amount: true },
    });

    const earnedDeals = await this.prisma.deal.aggregate({
      where: {
        channelOwnerId: id,
        status: { in: [DealStatus.RELEASED, DealStatus.VERIFIED] },
      },
      _sum: { amount: true },
    });

    return {
      totalDeals,
      activeDeals,
      completedDeals,
      totalChannels: user._count.channels,
      totalCampaigns: user._count.campaigns,
      totalSpent: spentDeals._sum.amount?.toString() ?? '0',
      totalEarned: earnedDeals._sum.amount?.toString() ?? '0',
    };
  }

  private mapToResponse(user: {
    id: string;
    telegramId: bigint;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    walletAddress: string | null;
    role: string;
    balanceTon: { toString: () => string };
    frozenTon: { toString: () => string };
    createdAt: Date;
  }): UserResponseDto {
    return {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      walletAddress: user.walletAddress ?? undefined,
      role: user.role,
      balanceTon: user.balanceTon.toString(),
      frozenTon: user.frozenTon.toString(),
      createdAt: user.createdAt.toISOString(),
    };
  }
}
