import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import {
  APPEAL_WINDOW_DISPUTE_MS,
  APPEAL_WINDOW_REJECTION_DAYS,
  TransactionType,
  TransactionStatus,
} from '@tam/shared-types';
import { Prisma } from '@tam/prisma-client';
import {
  AppealDealDto,
  AppealChannelDto,
  AppealFolderDto,
  AppealPlacementDto,
  ResolveAppealDto,
  AppealResponseDto,
} from './dto/appeal.dto';

@Injectable()
export class AppealsService {
  private readonly logger = new Logger(AppealsService.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  /**
   * Appeal a deal dispute resolution (RELEASED or REFUNDED)
   */
  async appealDealResolution(userId: string, dto: AppealDealDto): Promise<AppealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dto.dealId },
      include: { channel: { select: { title: true } } },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Must be RELEASED or REFUNDED
    if (deal.status !== 'RELEASED' && deal.status !== 'REFUNDED') {
      throw new BadRequestException('Can only appeal resolved deals (RELEASED or REFUNDED)');
    }

    // Only the losing side can appeal
    if (deal.status === 'RELEASED' && userId !== deal.advertiserId) {
      throw new ForbiddenException('Only the advertiser can appeal a RELEASED resolution');
    }
    if (deal.status === 'REFUNDED' && userId !== deal.channelOwnerId) {
      throw new ForbiddenException('Only the channel owner can appeal a REFUNDED resolution');
    }

    // Check appeal window
    if (!deal.appealDeadline || new Date() > deal.appealDeadline) {
      throw new BadRequestException('Appeal window has expired');
    }

    // Check if an appeal already exists (friendly error instead of unique constraint violation)
    const existing = await this.prisma.appeal.findFirst({
      where: { dealId: dto.dealId, type: 'DEAL_DISPUTE_RESOLUTION' },
    });
    if (existing) {
      throw new BadRequestException('An appeal has already been filed for this deal');
    }

    const appeal = await this.prisma.appeal.create({
      data: {
        type: 'DEAL_DISPUTE_RESOLUTION',
        appellantId: userId,
        originalAdminId: (deal as any).resolvedByAdminId ?? null,
        reason: dto.reason,
        dealId: dto.dealId,
        originalResolution: deal.status,
        frozenAmount: deal.status === 'RELEASED'
          ? deal.amount.sub(deal.platformFee)
          : deal.amount.add(deal.platformFee),
      },
    });

    this.logger.log(`Appeal ${appeal.id} filed for deal ${dto.dealId} by user ${userId}`);

    // Notify the other party
    const counterpartyId = deal.advertiserId === userId
      ? deal.channelOwnerId
      : deal.advertiserId;

    this.notificationService.send('APPEAL_FILED', counterpartyId, {
      dealId: dto.dealId,
      channelTitle: (deal as any).channel?.title,
      appealId: appeal.id,
      miniAppPath: `/deals/${dto.dealId}`,
    });

    return this.mapToResponse(appeal);
  }

  /**
   * Appeal a channel rejection
   */
  async appealChannelRejection(userId: string, dto: AppealChannelDto): Promise<AppealResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.status !== 'REJECTED') {
      throw new BadRequestException('Channel is not rejected');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Only the channel owner can appeal');
    }

    // Check 7-day window from rejection
    const windowEnd = new Date(channel.updatedAt.getTime() + APPEAL_WINDOW_REJECTION_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new BadRequestException('Appeal window has expired (7 days from rejection)');
    }

    const existing = await this.prisma.appeal.findFirst({
      where: { channelId: dto.channelId, type: 'CHANNEL_REJECTION' },
    });
    if (existing) {
      throw new BadRequestException('An appeal has already been filed for this channel');
    }

    const appeal = await this.prisma.appeal.create({
      data: {
        type: 'CHANNEL_REJECTION',
        appellantId: userId,
        originalAdminId: (channel as any).rejectedByAdminId ?? null,
        reason: dto.reason,
        channelId: dto.channelId,
      },
    });

    this.logger.log(`Appeal ${appeal.id} filed for channel ${dto.channelId} rejection`);

    return this.mapToResponse(appeal);
  }

  /**
   * Appeal a folder rejection
   */
  async appealFolderRejection(userId: string, dto: AppealFolderDto): Promise<AppealResponseDto> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: dto.folderId },
    });

    if (!folder) {
      throw new NotFoundException('Folder not found');
    }

    if (folder.status !== 'REJECTED') {
      throw new BadRequestException('Folder is not rejected');
    }

    if (folder.ownerId !== userId) {
      throw new ForbiddenException('Only the folder owner can appeal');
    }

    const windowEnd = new Date(folder.updatedAt.getTime() + APPEAL_WINDOW_REJECTION_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new BadRequestException('Appeal window has expired (7 days from rejection)');
    }

    const existing = await this.prisma.appeal.findFirst({
      where: { folderId: dto.folderId, type: 'FOLDER_REJECTION' },
    });
    if (existing) {
      throw new BadRequestException('An appeal has already been filed for this folder');
    }

    const appeal = await this.prisma.appeal.create({
      data: {
        type: 'FOLDER_REJECTION',
        appellantId: userId,
        originalAdminId: (folder as any).rejectedByAdminId ?? null,
        reason: dto.reason,
        folderId: dto.folderId,
      },
    });

    this.logger.log(`Appeal ${appeal.id} filed for folder ${dto.folderId} rejection`);

    return this.mapToResponse(appeal);
  }

  /**
   * Appeal a placement rejection
   */
  async appealPlacementRejection(userId: string, dto: AppealPlacementDto): Promise<AppealResponseDto> {
    const placement = await this.prisma.folderPlacement.findUnique({
      where: { id: dto.folderPlacementId },
      include: { folder: { select: { title: true } } },
    });

    if (!placement) {
      throw new NotFoundException('Placement not found');
    }

    if (placement.status !== 'REJECTED') {
      throw new BadRequestException('Placement is not rejected');
    }

    if (placement.channelOwnerId !== userId) {
      throw new ForbiddenException('Only the channel owner can appeal');
    }

    const windowEnd = new Date(placement.updatedAt.getTime() + APPEAL_WINDOW_REJECTION_DAYS * 24 * 60 * 60 * 1000);
    if (new Date() > windowEnd) {
      throw new BadRequestException('Appeal window has expired (7 days from rejection)');
    }

    const existing = await this.prisma.appeal.findFirst({
      where: { folderPlacementId: dto.folderPlacementId, type: 'PLACEMENT_REJECTION' },
    });
    if (existing) {
      throw new BadRequestException('An appeal has already been filed for this placement');
    }

    const appeal = await this.prisma.appeal.create({
      data: {
        type: 'PLACEMENT_REJECTION',
        appellantId: userId,
        originalAdminId: (placement as any).rejectedByAdminId ?? null,
        reason: dto.reason,
        folderPlacementId: dto.folderPlacementId,
      },
    });

    this.logger.log(`Appeal ${appeal.id} filed for placement ${dto.folderPlacementId} rejection`);

    return this.mapToResponse(appeal);
  }

  /**
   * Get appeals for the current user
   */
  async findMyAppeals(userId: string): Promise<AppealResponseDto[]> {
    const appeals = await this.prisma.appeal.findMany({
      where: { appellantId: userId },
      orderBy: { createdAt: 'desc' },
      include: {
        deal: { include: { channel: { select: { title: true } } } },
        channel: { select: { title: true } },
        folder: { select: { title: true } },
        folderPlacement: { include: { folder: { select: { title: true } } } },
      },
    });

    return appeals.map((a) => this.mapToResponse(a));
  }

  /**
   * Get all appeals (admin)
   */
  async findAll(): Promise<AppealResponseDto[]> {
    const appeals = await this.prisma.appeal.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        deal: { include: { channel: { select: { title: true } } } },
        channel: { select: { title: true } },
        folder: { select: { title: true } },
        folderPlacement: { include: { folder: { select: { title: true } } } },
      },
    });

    return appeals.map((a) => this.mapToResponse(a));
  }

  /**
   * Get appeal by ID
   */
  async findById(id: string, userId: string, isAdmin: boolean): Promise<AppealResponseDto> {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id },
      include: {
        deal: { include: { channel: { select: { title: true } } } },
        channel: { select: { title: true } },
        folder: { select: { title: true } },
        folderPlacement: { include: { folder: { select: { title: true } } } },
      },
    });

    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }

    if (!isAdmin && appeal.appellantId !== userId) {
      throw new ForbiddenException('Not authorized to view this appeal');
    }

    return this.mapToResponse(appeal);
  }

  /**
   * Resolve an appeal (admin only)
   */
  async resolveAppeal(
    appealId: string,
    adminId: string,
    dto: ResolveAppealDto,
  ): Promise<AppealResponseDto> {
    const appeal = await this.prisma.appeal.findUnique({
      where: { id: appealId },
      include: {
        deal: { include: { channel: { select: { title: true } } } },
        channel: { select: { title: true } },
        folder: { select: { title: true } },
        folderPlacement: { include: { folder: { select: { title: true } } } },
      },
    });

    if (!appeal) {
      throw new NotFoundException('Appeal not found');
    }

    if (appeal.status !== 'PENDING') {
      throw new BadRequestException('Appeal is already resolved');
    }

    // Different admin must review
    if (appeal.originalAdminId && adminId === appeal.originalAdminId) {
      throw new ForbiddenException('A different admin must review this appeal');
    }

    // For REVERSED deal appeals, verify the losing party has sufficient balance
    if (dto.decision === 'REVERSED' && appeal.type === 'DEAL_DISPUTE_RESOLUTION' && appeal.deal) {
      const deal = appeal.deal;
      const netAmount = deal.amount.sub(deal.platformFee);
      const totalFrozen = deal.amount.add(deal.platformFee);

      if (appeal.originalResolution === 'RELEASED') {
        const channelOwner = await this.prisma.user.findUnique({ where: { id: deal.channelOwnerId } });
        if (!channelOwner || channelOwner.balanceTon.lessThan(netAmount)) {
          throw new BadRequestException('Channel owner has insufficient balance for reversal');
        }
      } else if (appeal.originalResolution === 'REFUNDED') {
        const advertiser = await this.prisma.user.findUnique({ where: { id: deal.advertiserId } });
        if (!advertiser || advertiser.balanceTon.lessThan(totalFrozen)) {
          throw new BadRequestException('Advertiser has insufficient balance for reversal');
        }
      }
    }

    // Run reversal + appeal status update in a single transaction
    const updated = await this.prisma.$transaction(async (tx) => {
      if (dto.decision === 'REVERSED') {
        await this.processReversal(appeal, tx);
      } else if (dto.decision === 'UPHELD' && appeal.type === 'DEAL_DISPUTE_RESOLUTION' && appeal.deal) {
        // UPHELD: original decision stands — unfreeze funds and clear deadline immediately
        const deal = appeal.deal;
        const netAmount = deal.amount.sub(deal.platformFee);
        const totalFrozen = deal.amount.add(deal.platformFee);

        if (appeal.originalResolution === 'RELEASED') {
          await tx.user.update({
            where: { id: deal.channelOwnerId },
            data: { appealFrozenTon: { decrement: netAmount } },
          });
        } else if (appeal.originalResolution === 'REFUNDED') {
          await tx.user.update({
            where: { id: deal.advertiserId },
            data: { appealFrozenTon: { decrement: totalFrozen } },
          });
        }

        await tx.deal.update({
          where: { id: deal.id },
          data: { appealDeadline: null },
        });
      }

      return tx.appeal.update({
        where: { id: appealId },
        data: {
          status: dto.decision === 'UPHELD' ? 'UPHELD' : 'REVERSED',
          reviewerAdminId: adminId,
          resolvedAt: new Date(),
          adminNotes: dto.adminNotes,
        },
        include: {
          deal: { include: { channel: { select: { title: true } } } },
          channel: { select: { title: true } },
          folder: { select: { title: true } },
          folderPlacement: { include: { folder: { select: { title: true } } } },
        },
      });
    });

    this.logger.log(`Appeal ${appealId} resolved as ${dto.decision} by admin ${adminId}`);

    // Send notifications
    const channelTitle = this.getChannelTitle(appeal);
    const notifType = dto.decision === 'UPHELD' ? 'APPEAL_UPHELD' : 'APPEAL_REVERSED';

    this.notificationService.send(notifType, appeal.appellantId, {
      appealId,
      channelTitle,
      miniAppPath: appeal.dealId ? `/deals/${appeal.dealId}` : undefined,
    });

    // For deal appeals, also notify the counterparty
    if (appeal.deal) {
      const counterpartyId = appeal.appellantId === appeal.deal.advertiserId
        ? appeal.deal.channelOwnerId
        : appeal.deal.advertiserId;
      this.notificationService.send(notifType, counterpartyId, {
        appealId,
        channelTitle,
        dealId: appeal.dealId!,
        miniAppPath: `/deals/${appeal.dealId}`,
      });
    }

    return this.mapToResponse(updated);
  }

  /**
   * Process a reversal based on appeal type.
   * Accepts a transaction client so all writes happen atomically.
   */
  private async processReversal(appeal: any, tx: Prisma.TransactionClient): Promise<void> {
    switch (appeal.type) {
      case 'DEAL_DISPUTE_RESOLUTION':
        await this.reverseDealResolution(appeal, tx);
        break;
      case 'CHANNEL_REJECTION':
        await tx.channel.update({
          where: { id: appeal.channelId },
          data: { status: 'ACTIVE', rejectionReason: null },
        });
        break;
      case 'FOLDER_REJECTION':
        await tx.folder.update({
          where: { id: appeal.folderId },
          data: { status: 'ACTIVE' },
        });
        break;
      case 'PLACEMENT_REJECTION':
        await tx.folderPlacement.update({
          where: { id: appeal.folderPlacementId },
          data: { status: 'PENDING', rejectionReason: null },
        });
        break;
    }
  }

  /**
   * Reverse a deal dispute resolution
   * RELEASED → REVERSED: channelOwner loses, advertiser gets money back
   * REFUNDED → REVERSED: advertiser loses, channelOwner gets money
   */
  private async reverseDealResolution(appeal: any, tx: Prisma.TransactionClient): Promise<void> {
    const deal = appeal.deal;
    if (!deal) {
      throw new BadRequestException('Deal not found for this appeal');
    }

    const netAmount = deal.amount.sub(deal.platformFee);
    const totalFrozen = deal.amount.add(deal.platformFee);

    if (appeal.originalResolution === 'RELEASED') {
      // Original: channelOwner got netAmount, now reverse
      // channelOwner.balanceTon -= netAmount, appealFrozenTon -= netAmount
      // advertiser.balanceTon += netAmount (refund without fee)
      await tx.user.update({
        where: { id: deal.channelOwnerId },
        data: {
          balanceTon: { decrement: netAmount },
          appealFrozenTon: { decrement: netAmount },
        },
      });

      await tx.user.update({
        where: { id: deal.advertiserId },
        data: {
          balanceTon: { increment: netAmount },
        },
      });

      await tx.deal.update({
        where: { id: deal.id },
        data: { status: 'REFUNDED', appealDeadline: null },
      });

      await tx.transaction.create({
        data: {
          amount: netAmount,
          type: TransactionType.APPEAL_REVERSAL,
          status: TransactionStatus.CONFIRMED,
          userId: deal.advertiserId,
          dealId: deal.id,
          metadata: { action: 'appeal_reversal', from: 'RELEASED', to: 'REFUNDED', appealId: appeal.id },
        },
      });
    } else if (appeal.originalResolution === 'REFUNDED') {
      // Original: advertiser got totalFrozen back, now reverse
      // advertiser.balanceTon -= totalFrozen, appealFrozenTon -= totalFrozen
      // channelOwner.balanceTon += netAmount
      await tx.user.update({
        where: { id: deal.advertiserId },
        data: {
          balanceTon: { decrement: totalFrozen },
          appealFrozenTon: { decrement: totalFrozen },
        },
      });

      await tx.user.update({
        where: { id: deal.channelOwnerId },
        data: {
          balanceTon: { increment: netAmount },
        },
      });

      await tx.deal.update({
        where: { id: deal.id },
        data: { status: 'RELEASED', appealDeadline: null },
      });

      await tx.transaction.create({
        data: {
          amount: netAmount,
          type: TransactionType.APPEAL_REVERSAL,
          status: TransactionStatus.CONFIRMED,
          userId: deal.channelOwnerId,
          dealId: deal.id,
          metadata: { action: 'appeal_reversal', from: 'REFUNDED', to: 'RELEASED', appealId: appeal.id },
        },
      });
    }
  }

  private getChannelTitle(appeal: any): string {
    if (appeal.deal?.channel?.title) return appeal.deal.channel.title;
    if (appeal.channel?.title) return appeal.channel.title;
    if (appeal.folder?.title) return appeal.folder.title;
    if (appeal.folderPlacement?.folder?.title) return appeal.folderPlacement.folder.title;
    return 'канал';
  }

  private mapToResponse(appeal: any): AppealResponseDto {
    return {
      id: appeal.id,
      type: appeal.type,
      status: appeal.status,
      appellantId: appeal.appellantId,
      originalAdminId: appeal.originalAdminId ?? undefined,
      reviewerAdminId: appeal.reviewerAdminId ?? undefined,
      reason: appeal.reason,
      adminNotes: appeal.adminNotes ?? undefined,
      dealId: appeal.dealId ?? undefined,
      channelId: appeal.channelId ?? undefined,
      folderId: appeal.folderId ?? undefined,
      folderPlacementId: appeal.folderPlacementId ?? undefined,
      frozenAmount: appeal.frozenAmount?.toString() ?? undefined,
      originalResolution: appeal.originalResolution ?? undefined,
      createdAt: appeal.createdAt.toISOString(),
      resolvedAt: appeal.resolvedAt?.toISOString() ?? undefined,
      channelTitle: this.getChannelTitle(appeal),
      folderTitle: appeal.folder?.title ?? appeal.folderPlacement?.folder?.title ?? undefined,
      dealAmount: appeal.deal?.amount?.toString() ?? undefined,
    };
  }
}
