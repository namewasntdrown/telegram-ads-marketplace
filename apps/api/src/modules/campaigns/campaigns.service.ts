import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CampaignStatus } from '@tam/shared-types';
import {
  CreateCampaignDto,
  UpdateCampaignDto,
  CampaignFiltersDto,
  CampaignResponseDto,
  PaginatedCampaignsDto,
  PublicCampaignFiltersDto,
} from './dto/campaign.dto';
import { Prisma, Campaign } from '@tam/prisma-client';
import { NotificationService } from '../../common/notification/notification.service';

@Injectable()
export class CampaignsService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  async create(userId: string, dto: CreateCampaignDto): Promise<CampaignResponseDto> {
    const campaign = await this.prisma.campaign.create({
      data: {
        title: dto.title,
        description: dto.description,
        totalBudget: new Prisma.Decimal(dto.totalBudget),
        categories: dto.categories,
        targetLanguages: dto.targetLanguages,
        advertiserId: userId,
        status: CampaignStatus.DRAFT,
        ...(dto.briefText !== undefined && { briefText: dto.briefText }),
        ...(dto.requirements !== undefined && { requirements: dto.requirements }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.minSubscribers !== undefined && { minSubscribers: dto.minSubscribers }),
        ...(dto.maxBudgetPerDeal !== undefined && { maxBudgetPerDeal: new Prisma.Decimal(dto.maxBudgetPerDeal) }),
      },
      include: {
        _count: { select: { deals: true } },
        advertiser: { select: { username: true } },
      },
    });

    return this.mapToResponse(campaign);
  }

  async findByUser(
    userId: string,
    filters: CampaignFiltersDto
  ): Promise<PaginatedCampaignsDto> {
    const { page = 1, limit = 20, status } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {
      advertiserId: userId,
      ...(status && { status }),
    };

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { deals: true } },
          advertiser: { select: { username: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      items: campaigns.map((c) => this.mapToResponse(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, userId: string): Promise<CampaignResponseDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        _count: { select: { deals: true } },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    // Allow access if user is advertiser OR has a deal for this campaign
    if (campaign.advertiserId !== userId) {
      const hasDeal = await this.prisma.deal.findFirst({
        where: {
          campaignId: id,
          channelOwnerId: userId,
        },
      });
      if (!hasDeal) {
        throw new ForbiddenException('Not authorized to view this campaign');
      }
    }

    return this.mapToResponse(campaign);
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateCampaignDto
  ): Promise<CampaignResponseDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.advertiserId !== userId) {
      throw new ForbiddenException('Not authorized to update this campaign');
    }

    // Validate status transitions
    const statusChanged = dto.status && dto.status !== campaign.status;
    if (dto.status) {
      this.validateStatusTransition(campaign.status, dto.status);
    }

    const updated = await this.prisma.campaign.update({
      where: { id },
      data: {
        ...(dto.title && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.totalBudget && {
          totalBudget: new Prisma.Decimal(dto.totalBudget),
        }),
        ...(dto.categories && { categories: dto.categories }),
        ...(dto.targetLanguages && { targetLanguages: dto.targetLanguages }),
        ...(dto.status && { status: dto.status }),
        ...(dto.briefText !== undefined && { briefText: dto.briefText }),
        ...(dto.requirements !== undefined && { requirements: dto.requirements }),
        ...(dto.isPublic !== undefined && { isPublic: dto.isPublic }),
        ...(dto.minSubscribers !== undefined && { minSubscribers: dto.minSubscribers }),
        ...(dto.maxBudgetPerDeal !== undefined && {
          maxBudgetPerDeal: dto.maxBudgetPerDeal ? new Prisma.Decimal(dto.maxBudgetPerDeal) : null,
        }),
      },
      include: {
        _count: { select: { deals: true } },
        advertiser: { select: { username: true } },
      },
    });

    if (statusChanged) {
      this.notificationService.send('CAMPAIGN_STATUS_CHANGED', userId, {
        campaignId: id,
        campaignTitle: updated.title,
        newStatus: dto.status,
        miniAppPath: `/campaigns/${id}`,
      });
    }

    return this.mapToResponse(updated);
  }

  async findPublic(filters: PublicCampaignFiltersDto): Promise<PaginatedCampaignsDto> {
    const { page = 1, limit = 20, categories, targetLanguages, search, sortBy } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.CampaignWhereInput = {
      isPublic: true,
      status: CampaignStatus.ACTIVE,
      ...(categories?.length && { categories: { hasSome: categories } }),
      ...(targetLanguages?.length && { targetLanguages: { hasSome: targetLanguages } }),
      ...(search && {
        OR: [
          { title: { contains: search, mode: 'insensitive' as const } },
          { briefText: { contains: search, mode: 'insensitive' as const } },
        ],
      }),
    };

    let orderBy: Prisma.CampaignOrderByWithRelationInput;
    switch (sortBy) {
      case 'budget_high':
        orderBy = { totalBudget: 'desc' };
        break;
      case 'budget_low':
        orderBy = { totalBudget: 'asc' };
        break;
      default:
        orderBy = { createdAt: 'desc' };
    }

    const [campaigns, total] = await Promise.all([
      this.prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          _count: { select: { deals: true } },
          advertiser: { select: { username: true } },
        },
      }),
      this.prisma.campaign.count({ where }),
    ]);

    return {
      items: campaigns.map((c) => this.mapToResponse(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async delete(id: string, userId: string): Promise<void> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: {
        deals: {
          where: {
            status: {
              notIn: ['CANCELLED', 'EXPIRED', 'REFUNDED', 'RELEASED'],
            },
          },
        },
      },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    if (campaign.advertiserId !== userId) {
      throw new ForbiddenException('Not authorized to delete this campaign');
    }

    if (campaign.deals.length > 0) {
      throw new BadRequestException('Cannot delete campaign with active deals');
    }

    await this.prisma.campaign.delete({ where: { id } });
  }

  private validateStatusTransition(
    currentStatus: string,
    newStatus: CampaignStatus
  ): void {
    const allowedTransitions: Record<string, CampaignStatus[]> = {
      [CampaignStatus.DRAFT]: [CampaignStatus.ACTIVE, CampaignStatus.CANCELLED],
      [CampaignStatus.ACTIVE]: [
        CampaignStatus.PAUSED,
        CampaignStatus.COMPLETED,
        CampaignStatus.CANCELLED,
      ],
      [CampaignStatus.PAUSED]: [
        CampaignStatus.ACTIVE,
        CampaignStatus.CANCELLED,
      ],
      [CampaignStatus.COMPLETED]: [],
      [CampaignStatus.CANCELLED]: [],
    };

    const allowed = allowedTransitions[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from ${currentStatus} to ${newStatus}`
      );
    }
  }

  private mapToResponse(
    campaign: Campaign & { _count: { deals: number }; advertiser?: { username: string | null } }
  ): CampaignResponseDto {
    const c = campaign as any;
    return {
      id: campaign.id,
      title: campaign.title,
      description: campaign.description ?? undefined,
      totalBudget: campaign.totalBudget.toString(),
      spentBudget: campaign.spentBudget.toString(),
      categories: campaign.categories,
      targetLanguages: campaign.targetLanguages,
      status: campaign.status as CampaignStatus,
      advertiserId: campaign.advertiserId,
      dealsCount: campaign._count.deals,
      briefText: c.briefText ?? undefined,
      requirements: c.requirements ?? undefined,
      isPublic: c.isPublic ?? false,
      minSubscribers: c.minSubscribers ?? undefined,
      maxBudgetPerDeal: c.maxBudgetPerDeal?.toString() ?? undefined,
      advertiserUsername: campaign.advertiser?.username ?? undefined,
      createdAt: campaign.createdAt.toISOString(),
    };
  }
}
