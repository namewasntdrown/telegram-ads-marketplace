import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateFolderDto,
  UpdateFolderDto,
  FolderFiltersDto,
  FolderResponseDto,
  PaginatedFoldersDto,
  BoostFolderDto,
  UpdateFolderStatusDto,
  FolderStatus,
} from './dto/folder.dto';
import { Prisma, Folder } from '@tam/prisma-client';

const MAX_FOLDERS_PER_USER = 10;

interface SyncedChannel {
  telegramId: string;
  title: string;
  username?: string;
  subscriberCount: number;
}

@Injectable()
export class FoldersService {
  private readonly logger = new Logger(FoldersService.name);
  private readonly mtprotoUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    this.mtprotoUrl = this.configService.get('MTPROTO_URL', 'http://mtproto-worker:3001');
  }

  parseFolderLink(link: string): { folderLink: string; folderHash: string } {
    // Handle t.me/addlist/hash or https://t.me/addlist/hash
    const addlistMatch = link.match(/(?:https?:\/\/)?t\.me\/addlist\/([a-zA-Z0-9_-]+)/);
    if (addlistMatch && addlistMatch[1]) {
      return {
        folderLink: `t.me/addlist/${addlistMatch[1]}`,
        folderHash: addlistMatch[1],
      };
    }

    // Handle telegram.me/addlist/hash or https://telegram.me/addlist/hash
    const telegramMeMatch = link.match(/(?:https?:\/\/)?telegram\.me\/addlist\/([a-zA-Z0-9_-]+)/);
    if (telegramMeMatch && telegramMeMatch[1]) {
      return {
        folderLink: `t.me/addlist/${telegramMeMatch[1]}`,
        folderHash: telegramMeMatch[1],
      };
    }

    throw new BadRequestException(
      'Invalid folder link format. Use t.me/addlist/hash or https://t.me/addlist/hash'
    );
  }

  async create(userId: string, dto: CreateFolderDto): Promise<FolderResponseDto> {
    // Check user's folder limit
    const folderCount = await this.prisma.folder.count({
      where: { ownerId: userId },
    });

    if (folderCount >= MAX_FOLDERS_PER_USER) {
      throw new BadRequestException(
        `Maximum ${MAX_FOLDERS_PER_USER} folders allowed per user`
      );
    }

    const { folderLink, folderHash } = this.parseFolderLink(dto.link);

    // Check if folder already exists
    const existing = await this.prisma.folder.findUnique({
      where: { folderLink },
    });

    if (existing) {
      throw new BadRequestException('Folder already registered');
    }

    const folder = await this.prisma.folder.create({
      data: {
        title: dto.title,
        description: dto.description,
        folderLink,
        folderHash,
        categories: dto.categories,
        ownerId: userId,
        status: FolderStatus.PENDING,
      },
    });

    return this.mapToResponse(folder);
  }

  async findAll(filters: FolderFiltersDto): Promise<PaginatedFoldersDto> {
    const { page = 1, limit = 20, ...rest } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.FolderWhereInput = {
      status: rest.status ?? FolderStatus.ACTIVE,
    };

    if (rest.categories?.length) {
      where.categories = { hasSome: rest.categories };
    }

    const now = new Date();

    // Fetch boosted folders first (boostUntil > now), sorted by boostAmount DESC
    // Then non-boosted folders sorted by createdAt DESC
    const [folders, total] = await Promise.all([
      this.prisma.$queryRaw<Folder[]>`
        SELECT * FROM "Folder"
        WHERE status = ${where.status}::text::"FolderStatus"
        ${rest.categories?.length ? Prisma.sql`AND categories && ${rest.categories}` : Prisma.empty}
        ORDER BY
          CASE WHEN "boostUntil" > ${now} THEN 0 ELSE 1 END,
          CASE WHEN "boostUntil" > ${now} THEN "boostAmount" END DESC NULLS LAST,
          "createdAt" DESC
        LIMIT ${limit}
        OFFSET ${skip}
      `,
      this.prisma.folder.count({ where }),
    ]);

    return {
      items: folders.map((f) => this.mapToResponse(f)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPending(): Promise<FolderResponseDto[]> {
    const folders = await this.prisma.folder.findMany({
      where: { status: FolderStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });

    return folders.map((f) => this.mapToResponse(f));
  }

  async findById(id: string): Promise<FolderResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return this.mapToResponse(folder);
  }

  async findByUser(userId: string): Promise<FolderResponseDto[]> {
    const folders = await this.prisma.folder.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return folders.map((f) => this.mapToResponse(f));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateFolderDto
  ): Promise<FolderResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to update this folder');
    }

    const updated = await this.prisma.folder.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.categories && { categories: dto.categories }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.collectionDeadline !== undefined && {
          collectionDeadline: dto.collectionDeadline ? new Date(dto.collectionDeadline) : null
        }),
        ...(dto.maxChannels !== undefined && { maxChannels: dto.maxChannels }),
        ...(dto.minSubscribers !== undefined && { minSubscribers: dto.minSubscribers }),
      },
    });

    return this.mapToResponse(updated);
  }

  async updateStatus(id: string, dto: UpdateFolderStatusDto, adminId?: string): Promise<FolderResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (dto.status === FolderStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting a folder');
    }

    const updated = await this.prisma.folder.update({
      where: { id },
      data: {
        status: dto.status,
        rejectedByAdminId: dto.status === FolderStatus.REJECTED ? (adminId ?? null) : null,
      },
    });

    return this.mapToResponse(updated);
  }

  async boost(id: string, userId: string, dto: BoostFolderDto): Promise<FolderResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to boost this folder');
    }

    if (folder.status !== FolderStatus.ACTIVE) {
      throw new BadRequestException('Only active folders can be boosted');
    }

    const amountPerDay = new Prisma.Decimal(dto.amountPerDay);
    const totalCost = amountPerDay.mul(dto.days);

    // Check user balance
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.balanceTon.lt(totalCost)) {
      throw new BadRequestException('Insufficient balance');
    }

    // Calculate new boostUntil date
    const now = new Date();
    const currentBoostUntil = folder.boostUntil && folder.boostUntil > now
      ? folder.boostUntil
      : now;
    const newBoostUntil = new Date(currentBoostUntil.getTime() + dto.days * 24 * 60 * 60 * 1000);

    // Execute transaction: deduct balance, update folder boost, create transaction record
    const [updated] = await this.prisma.$transaction([
      this.prisma.folder.update({
        where: { id },
        data: {
          boostAmount: amountPerDay,
          boostUntil: newBoostUntil,
        },
      }),
      this.prisma.user.update({
        where: { id: userId },
        data: {
          balanceTon: { decrement: totalCost },
        },
      }),
      this.prisma.transaction.create({
        data: {
          amount: totalCost,
          type: 'BOOST_FOLDER',
          status: 'CONFIRMED',
          userId,
          metadata: {
            folderId: id,
            days: dto.days,
            amountPerDay: dto.amountPerDay,
          },
        },
      }),
    ]);

    return this.mapToResponse(updated);
  }

  async setPricePerChannel(
    id: string,
    userId: string,
    price: string | null,
  ): Promise<FolderResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to update this folder');
    }

    if (folder.status !== FolderStatus.ACTIVE) {
      throw new BadRequestException('Only active folders can set pricing');
    }

    // Validate price if not null
    if (price !== null) {
      const priceDecimal = new Prisma.Decimal(price);
      if (priceDecimal.lte(0)) {
        throw new BadRequestException('Price must be greater than 0');
      }
    }

    const updated = await this.prisma.folder.update({
      where: { id },
      data: {
        pricePerChannel: price ? new Prisma.Decimal(price) : null,
      },
    });

    return this.mapToResponse(updated);
  }

  async delete(id: string, userId: string): Promise<void> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to delete this folder');
    }

    await this.prisma.folder.delete({ where: { id } });
  }

  async syncChannels(id: string, userId: string): Promise<{
    success: boolean;
    channelsCount?: number;
    channels?: SyncedChannel[];
    error?: string;
  }> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    // Only owner can trigger sync
    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to sync this folder');
    }

    if (!folder.folderHash) {
      return { success: false, error: 'Folder hash not available' };
    }

    try {
      // Call mtproto-worker to sync
      const response = await fetch(`${this.mtprotoUrl}/internal/folders/${id}/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json() as {
        success: boolean;
        channelsCount?: number;
        channels?: SyncedChannel[];
        error?: string;
      };
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to sync folder ${id}: ${error.message}`);
      return { success: false, error: 'Sync service unavailable' };
    }
  }

  async getSyncedChannels(id: string): Promise<{
    channels: SyncedChannel[];
    lastSyncedAt: string | null;
  }> {
    const folder = await this.prisma.folder.findUnique({
      where: { id },
      select: {
        syncedChannels: true,
        lastSyncedAt: true,
      },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    return {
      channels: (folder.syncedChannels as unknown as SyncedChannel[]) || [],
      lastSyncedAt: folder.lastSyncedAt?.toISOString() || null,
    };
  }

  private mapToResponse(folder: Folder): FolderResponseDto {
    const now = new Date();
    const isBoosted = folder.boostUntil !== null && folder.boostUntil > now;
    const f = folder as any; // Cast for new fields not yet in Prisma types

    return {
      id: folder.id,
      title: folder.title,
      description: folder.description ?? undefined,
      folderLink: folder.folderLink,
      folderHash: folder.folderHash ?? undefined,
      categories: folder.categories,
      status: folder.status as FolderStatus,
      boostAmount: folder.boostAmount.toString(),
      boostUntil: folder.boostUntil?.toISOString(),
      isBoosted,
      pricePerChannel: folder.pricePerChannel?.toString(),
      collectionDeadline: f.collectionDeadline?.toISOString(),
      maxChannels: f.maxChannels ?? undefined,
      minSubscribers: f.minSubscribers ?? undefined,
      ownerId: folder.ownerId,
      createdAt: folder.createdAt.toISOString(),
    };
  }
}
