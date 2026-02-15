import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { Prisma } from '@tam/prisma-client';
import { PLATFORM_FEE_PERCENT } from '@tam/shared-types';
import { NotificationService } from '../../common/notification/notification.service';
import {
  CreateFolderPlacementDto,
  RejectPlacementDto,
  FolderPlacementResponseDto,
  FolderPlacementFiltersDto,
  PaginatedPlacementsDto,
} from './dto/folder-placement.dto';

@Injectable()
export class FolderPlacementsService {
  private readonly logger = new Logger(FolderPlacementsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Создать заявку на размещение канала в папке
   */
  async create(
    userId: string,
    folderId: string,
    dto: CreateFolderPlacementDto,
  ): Promise<FolderPlacementResponseDto> {
    // Проверить что канал принадлежит пользователю
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('You do not own this channel');
    }

    // Проверить что канал активен
    if (channel.status !== 'ACTIVE') {
      throw new BadRequestException('Channel must be active');
    }

    // Проверить что папка существует и активна
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.status !== 'ACTIVE') {
      throw new BadRequestException('Folder is not active');
    }

    // Проверить дедлайн сбора
    const folderAny = folder as any;
    if (folderAny.collectionDeadline && new Date(folderAny.collectionDeadline) < new Date()) {
      throw new BadRequestException('Collection deadline has passed');
    }

    // Проверить минимальное количество подписчиков
    if (folderAny.minSubscribers && channel.subscriberCount < folderAny.minSubscribers) {
      throw new BadRequestException(
        `Channel must have at least ${folderAny.minSubscribers} subscribers`
      );
    }

    // Проверить максимальное количество каналов
    if (folderAny.maxChannels) {
      const approvedCount = await this.prisma.folderPlacement.count({
        where: {
          folderId,
          status: { in: ['APPROVED', 'COMPLETED'] },
        },
      });
      if (approvedCount >= folderAny.maxChannels) {
        throw new BadRequestException('Folder has reached maximum number of channels');
      }
    }

    // Проверить что установлена цена
    if (!folder.pricePerChannel || folder.pricePerChannel.lte(0)) {
      throw new BadRequestException('This folder does not accept paid placements');
    }

    // Проверить что канал еще не размещен в этой папке
    const existingPlacement = await this.prisma.folderPlacement.findUnique({
      where: {
        folderId_channelId: {
          folderId,
          channelId: dto.channelId,
        },
      },
    });

    if (existingPlacement) {
      if (existingPlacement.status === 'PENDING') {
        throw new BadRequestException('Placement request already exists');
      }
      if (existingPlacement.status === 'APPROVED') {
        throw new BadRequestException('Channel is already placed in this folder');
      }
    }

    // Рассчитать сумму и комиссию
    const amount = folder.pricePerChannel;
    const platformFee = amount.mul(PLATFORM_FEE_PERCENT).div(100);
    const totalAmount = amount.add(platformFee);

    // Проверить баланс пользователя
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.balanceTon.lt(totalAmount)) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${totalAmount.toString()} TON, Available: ${user.balanceTon.toString()} TON`,
      );
    }

    // Создать размещение со статусом PENDING
    const placement = await this.prisma.folderPlacement.create({
      data: {
        folderId,
        channelId: dto.channelId,
        channelOwnerId: userId,
        folderOwnerId: folder.ownerId,
        amount,
        platformFee,
        status: 'PENDING',
      },
      include: {
        folder: {
          select: {
            id: true,
            title: true,
            folderLink: true,
            pricePerChannel: true,
          },
        },
        channel: {
          select: {
            id: true,
            title: true,
            username: true,
            avatarUrl: true,
            subscriberCount: true,
          },
        },
        channelOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
        folderOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
    });

    this.logger.log(
      `Placement request created: ${placement.id} for channel ${dto.channelId} in folder ${folderId}`,
    );

    this.notificationService.send('PLACEMENT_REQUESTED', folder.ownerId, {
      channelId: dto.channelId,
      folderTitle: folder.title,
      miniAppPath: `/folder-placements/${placement.id}`,
    });

    return this.mapToResponse(placement);
  }

  /**
   * Одобрить заявку (только владелец папки)
   * Средства блокируются на 3 дня, затем выплачиваются владельцу папки
   */
  async approve(placementId: string, userId: string): Promise<FolderPlacementResponseDto> {
    const placement = await this.prisma.folderPlacement.findUnique({
      where: { id: placementId },
      include: {
        folder: true,
        channel: true,
      },
    });

    if (!placement) {
      throw new NotFoundException('Placement not found');
    }

    // Проверить что это владелец папки
    if (placement.folderOwnerId !== userId) {
      throw new ForbiddenException('Only folder owner can approve placements');
    }

    // Проверить статус
    if (placement.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot approve placement with status ${placement.status}`,
      );
    }

    const totalAmount = placement.amount.add(placement.platformFee);
    const now = new Date();
    const escrowReleaseAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000); // +3 дня

    // Выполнить транзакцию
    const result = await this.prisma.$transaction(async (tx) => {
      // 1. Блокировать средства у владельца канала
      const channelOwner = await tx.user.update({
        where: { id: placement.channelOwnerId },
        data: {
          balanceTon: { decrement: totalAmount },
          frozenTon: { increment: totalAmount },
        },
      });

      // Проверить что баланс не ушел в минус
      if (channelOwner.balanceTon.lt(0)) {
        throw new BadRequestException('Insufficient balance');
      }

      // 2. Создать транзакцию ESCROW_LOCK
      await tx.transaction.create({
        data: {
          amount: totalAmount,
          type: 'ESCROW_LOCK',
          status: 'CONFIRMED',
          userId: placement.channelOwnerId,
          folderPlacementId: placement.id,
          metadata: {
            folderId: placement.folderId,
            channelId: placement.channelId,
            action: 'LOCK_FOR_PLACEMENT',
            escrowReleaseAt: escrowReleaseAt.toISOString(),
          },
        },
      });

      // 3. Обновить статус размещения (средства остаются в escrow на 3 дня)
      const updatedPlacement = await tx.folderPlacement.update({
        where: { id: placementId },
        data: {
          status: 'APPROVED',
          approvedAt: now,
          escrowReleaseAt,
        },
        include: {
          folder: {
            select: {
              id: true,
              title: true,
              folderLink: true,
              pricePerChannel: true,
            },
          },
          channel: {
            select: {
              id: true,
              title: true,
              username: true,
              avatarUrl: true,
              subscriberCount: true,
            },
          },
          channelOwner: {
            select: {
              id: true,
              username: true,
              firstName: true,
            },
          },
          folderOwner: {
            select: {
              id: true,
              username: true,
              firstName: true,
            },
          },
        },
      });

      return updatedPlacement;
    });

    this.logger.log(`Placement approved: ${placementId}, escrow release at: ${escrowReleaseAt.toISOString()}`);

    this.notificationService.send('PLACEMENT_APPROVED', placement.channelOwnerId, {
      folderTitle: placement.folder?.title,
      miniAppPath: `/folder-placements/${placementId}`,
    });

    return this.mapToResponse(result);
  }

  /**
   * Отклонить заявку (только владелец папки)
   */
  async reject(
    placementId: string,
    userId: string,
    dto: RejectPlacementDto,
  ): Promise<FolderPlacementResponseDto> {
    const placement = await this.prisma.folderPlacement.findUnique({
      where: { id: placementId },
    });

    if (!placement) {
      throw new NotFoundException('Placement not found');
    }

    // Проверить что это владелец папки
    if (placement.folderOwnerId !== userId) {
      throw new ForbiddenException('Only folder owner can reject placements');
    }

    // Проверить статус
    if (placement.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot reject placement with status ${placement.status}`,
      );
    }

    // Обновить статус
    const updatedPlacement = await this.prisma.folderPlacement.update({
      where: { id: placementId },
      data: {
        status: 'REJECTED',
        rejectionReason: dto.reason,
        rejectedByAdminId: userId,
      },
      include: {
        folder: {
          select: {
            id: true,
            title: true,
            folderLink: true,
            pricePerChannel: true,
          },
        },
        channel: {
          select: {
            id: true,
            title: true,
            username: true,
            avatarUrl: true,
            subscriberCount: true,
          },
        },
        channelOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
        folderOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
    });

    this.logger.log(`Placement rejected: ${placementId}`);

    this.notificationService.send('PLACEMENT_REJECTED', placement.channelOwnerId, {
      folderTitle: updatedPlacement.folder?.title,
      reason: dto.reason,
      miniAppPath: `/folder-placements/${placementId}`,
    });

    return this.mapToResponse(updatedPlacement);
  }

  /**
   * Отменить заявку (только владелец канала, только PENDING)
   */
  async cancel(placementId: string, userId: string): Promise<FolderPlacementResponseDto> {
    const placement = await this.prisma.folderPlacement.findUnique({
      where: { id: placementId },
    });

    if (!placement) {
      throw new NotFoundException('Placement not found');
    }

    // Проверить что это владелец канала
    if (placement.channelOwnerId !== userId) {
      throw new ForbiddenException('Only channel owner can cancel placements');
    }

    // Проверить статус
    if (placement.status !== 'PENDING') {
      throw new BadRequestException(
        `Cannot cancel placement with status ${placement.status}`,
      );
    }

    // Обновить статус
    const updatedPlacement = await this.prisma.folderPlacement.update({
      where: { id: placementId },
      data: {
        status: 'CANCELLED',
      },
      include: {
        folder: {
          select: {
            id: true,
            title: true,
            folderLink: true,
            pricePerChannel: true,
          },
        },
        channel: {
          select: {
            id: true,
            title: true,
            username: true,
            avatarUrl: true,
            subscriberCount: true,
          },
        },
        channelOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
        folderOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
    });

    this.logger.log(`Placement cancelled: ${placementId}`);

    return this.mapToResponse(updatedPlacement);
  }

  /**
   * Получить размещения папки
   */
  async findByFolder(
    folderId: string,
    filters: FolderPlacementFiltersDto = {},
  ): Promise<PaginatedPlacementsDto> {
    const { status, page = 1, limit = 20 } = filters;

    const where: Prisma.FolderPlacementWhereInput = {
      folderId,
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.folderPlacement.findMany({
        where,
        include: {
          channel: {
            select: {
              id: true,
              title: true,
              username: true,
              avatarUrl: true,
              subscriberCount: true,
            },
          },
          channelOwner: {
            select: {
              id: true,
              username: true,
              firstName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.folderPlacement.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Получить папки где находится канал
   */
  async findByChannel(channelId: string): Promise<FolderPlacementResponseDto[]> {
    const placements = await this.prisma.folderPlacement.findMany({
      where: {
        channelId,
        status: 'APPROVED',
      },
      include: {
        folder: {
          select: {
            id: true,
            title: true,
            folderLink: true,
            pricePerChannel: true,
          },
        },
        folderOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
      orderBy: { approvedAt: 'desc' },
    });

    return placements.map((p) => this.mapToResponse(p));
  }

  /**
   * Получить размещения пользователя
   */
  async findUserPlacements(
    userId: string,
    type: 'channel' | 'folder',
    filters: FolderPlacementFiltersDto = {},
  ): Promise<PaginatedPlacementsDto> {
    const { status, page = 1, limit = 20 } = filters;

    const where: Prisma.FolderPlacementWhereInput = {
      ...(type === 'channel'
        ? { channelOwnerId: userId }
        : { folderOwnerId: userId }),
      ...(status && { status }),
    };

    const [items, total] = await Promise.all([
      this.prisma.folderPlacement.findMany({
        where,
        include: {
          folder: {
            select: {
              id: true,
              title: true,
              folderLink: true,
              pricePerChannel: true,
            },
          },
          channel: {
            select: {
              id: true,
              title: true,
              username: true,
              avatarUrl: true,
              subscriberCount: true,
            },
          },
          channelOwner: {
            select: {
              id: true,
              username: true,
              firstName: true,
            },
          },
          folderOwner: {
            select: {
              id: true,
              username: true,
              firstName: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.folderPlacement.count({ where }),
    ]);

    return {
      items: items.map((item) => this.mapToResponse(item)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Получить размещение по ID
   */
  async findOne(id: string): Promise<FolderPlacementResponseDto> {
    const placement = await this.prisma.folderPlacement.findUnique({
      where: { id },
      include: {
        folder: {
          select: {
            id: true,
            title: true,
            folderLink: true,
            pricePerChannel: true,
          },
        },
        channel: {
          select: {
            id: true,
            title: true,
            username: true,
            avatarUrl: true,
            subscriberCount: true,
          },
        },
        channelOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
        folderOwner: {
          select: {
            id: true,
            username: true,
            firstName: true,
          },
        },
      },
    });

    if (!placement) {
      throw new NotFoundException('Placement not found');
    }

    return this.mapToResponse(placement);
  }

  private mapToResponse(placement: any): FolderPlacementResponseDto {
    return {
      id: placement.id,
      folderId: placement.folderId,
      channelId: placement.channelId,
      channelOwnerId: placement.channelOwnerId,
      folderOwnerId: placement.folderOwnerId,
      amount: placement.amount.toString(),
      platformFee: placement.platformFee.toString(),
      status: placement.status,
      rejectionReason: placement.rejectionReason,
      createdAt: placement.createdAt,
      updatedAt: placement.updatedAt,
      approvedAt: placement.approvedAt,
      escrowReleaseAt: placement.escrowReleaseAt,
      completedAt: placement.completedAt,
      folder: placement.folder
        ? {
            id: placement.folder.id,
            title: placement.folder.title,
            folderLink: placement.folder.folderLink,
            pricePerChannel: placement.folder.pricePerChannel?.toString(),
          }
        : undefined,
      channel: placement.channel
        ? {
            id: placement.channel.id,
            title: placement.channel.title,
            username: placement.channel.username,
            avatarUrl: placement.channel.avatarUrl,
            subscriberCount: placement.channel.subscriberCount,
          }
        : undefined,
      channelOwner: placement.channelOwner
        ? {
            id: placement.channelOwner.id,
            username: placement.channelOwner.username,
            firstName: placement.channelOwner.firstName,
          }
        : undefined,
      folderOwner: placement.folderOwner
        ? {
            id: placement.folderOwner.id,
            username: placement.folderOwner.username,
            firstName: placement.folderOwner.firstName,
          }
        : undefined,
    };
  }
}
