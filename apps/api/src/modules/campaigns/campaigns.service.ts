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
} from './dto/campaign.dto';
import { Prisma, Campaign } from '@tam/prisma-client';

@Injectable()
export class CampaignsService {
  constructor(private prisma: PrismaService) {}

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
      },
      include: {
        _count: { select: { deals: true } },
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
      },
      include: {
        _count: { select: { deals: true } },
      },
    });

    return this.mapToResponse(updated);
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
    campaign: Campaign & { _count: { deals: number } }
  ): CampaignResponseDto {
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
      createdAt: campaign.createdAt.toISOString(),
    };
  }
}
