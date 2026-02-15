import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

export interface ChannelAdminResponseDto {
  id: string;
  channelId: string;
  userId: string;
  username?: string;
  firstName?: string;
  role: string;
  addedAt: string;
}

@Injectable()
export class ChannelAdminsService {
  constructor(private prisma: PrismaService) {}

  async isChannelAdmin(channelId: string, userId: string): Promise<boolean> {
    const admin = await this.prisma.channelAdmin.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    return !!admin;
  }

  async isChannelOwner(channelId: string, userId: string): Promise<boolean> {
    const admin = await this.prisma.channelAdmin.findUnique({
      where: { channelId_userId: { channelId, userId } },
    });
    return admin?.role === 'OWNER';
  }

  async getAdmins(channelId: string): Promise<ChannelAdminResponseDto[]> {
    const admins = await this.prisma.channelAdmin.findMany({
      where: { channelId },
      include: {
        user: { select: { username: true, firstName: true } },
      },
      orderBy: { addedAt: 'asc' },
    });

    return admins.map((a) => ({
      id: a.id,
      channelId: a.channelId,
      userId: a.userId,
      username: a.user.username ?? undefined,
      firstName: a.user.firstName ?? undefined,
      role: a.role,
      addedAt: a.addedAt.toISOString(),
    }));
  }

  async addAdmin(
    channelId: string,
    ownerUserId: string,
    username: string,
  ): Promise<ChannelAdminResponseDto> {
    // Verify caller is OWNER
    const callerAdmin = await this.prisma.channelAdmin.findUnique({
      where: { channelId_userId: { channelId, userId: ownerUserId } },
    });

    if (!callerAdmin || callerAdmin.role !== 'OWNER') {
      throw new ForbiddenException('Only channel owner can add admins');
    }

    // Look up user by username
    const targetUser = await this.prisma.user.findFirst({
      where: { username: { equals: username, mode: 'insensitive' } },
    });

    if (!targetUser) {
      throw new NotFoundException(`User @${username} not found`);
    }

    if (targetUser.id === ownerUserId) {
      throw new BadRequestException('You are already the owner');
    }

    // Check if already an admin
    const existing = await this.prisma.channelAdmin.findUnique({
      where: { channelId_userId: { channelId, userId: targetUser.id } },
    });

    if (existing) {
      throw new BadRequestException(`User @${username} is already an admin`);
    }

    const admin = await this.prisma.channelAdmin.create({
      data: {
        channelId,
        userId: targetUser.id,
        role: 'ADMIN',
      },
      include: {
        user: { select: { username: true, firstName: true } },
      },
    });

    return {
      id: admin.id,
      channelId: admin.channelId,
      userId: admin.userId,
      username: admin.user.username ?? undefined,
      firstName: admin.user.firstName ?? undefined,
      role: admin.role,
      addedAt: admin.addedAt.toISOString(),
    };
  }

  async removeAdmin(
    channelId: string,
    ownerUserId: string,
    adminId: string,
  ): Promise<void> {
    // Verify caller is OWNER
    const callerAdmin = await this.prisma.channelAdmin.findUnique({
      where: { channelId_userId: { channelId, userId: ownerUserId } },
    });

    if (!callerAdmin || callerAdmin.role !== 'OWNER') {
      throw new ForbiddenException('Only channel owner can remove admins');
    }

    const targetAdmin = await this.prisma.channelAdmin.findUnique({
      where: { id: adminId },
    });

    if (!targetAdmin || targetAdmin.channelId !== channelId) {
      throw new NotFoundException('Admin not found');
    }

    if (targetAdmin.role === 'OWNER') {
      throw new BadRequestException('Cannot remove the channel owner');
    }

    await this.prisma.channelAdmin.delete({ where: { id: adminId } });
  }
}
