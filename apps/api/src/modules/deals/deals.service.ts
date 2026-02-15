import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  DealStatus,
  ContentType,
  DisputeReason,
  PLATFORM_FEE_PERCENT,
  APPEAL_WINDOW_DISPUTE_MS,
} from '@tam/shared-types';
import { sanitizeHtml, sanitizeUrl } from '@tam/security';
import {
  CreateDealDto,
  DisputeDealDto,
  DealFiltersDto,
  DealResponseDto,
  PaginatedDealsDto,
  RejectContentDto,
  ApplyToCampaignDto,
  SendMessageDto,
} from './dto/deal.dto';
import { SubmitContentDto } from './dto/deal.dto';
import { DealStateMachine, DealAction } from './state-machine/deal-state.machine';
import { Prisma, Deal } from '@tam/prisma-client';
import { EscrowService } from '../escrow/escrow.service';
import { NotificationService } from '../../common/notification/notification.service';
import { ChannelAdminsService } from '../channels/channel-admins.service';

@Injectable()
export class DealsService {
  private readonly logger = new Logger(DealsService.name);

  constructor(
    private prisma: PrismaService,
    private stateMachine: DealStateMachine,
    private escrowService: EscrowService,
    private notificationService: NotificationService,
    private channelAdminsService: ChannelAdminsService,
  ) {}

  /**
   * Создание заявки на рекламу
   * Статус: PENDING (ожидает одобрения владельца канала)
   * Средства НЕ блокируются, но проверяется достаточность баланса
   */
  async create(userId: string, dto: CreateDealDto): Promise<DealResponseDto> {
    // Verify campaign belongs to user
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: dto.campaignId },
    });

    if (!campaign || campaign.advertiserId !== userId) {
      throw new ForbiddenException('Campaign not found or not authorized');
    }

    // Verify channel exists and is active
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });

    if (!channel || channel.status !== 'ACTIVE') {
      throw new BadRequestException('Channel not found or not active');
    }

    // Cannot create deal for own channel
    if (channel.ownerId === userId) {
      throw new BadRequestException('Cannot create deal for your own channel');
    }

    // Calculate amounts
    const amount = new Prisma.Decimal(dto.amount);
    const platformFee = amount.mul(PLATFORM_FEE_PERCENT).div(100);
    const totalRequired = amount.add(platformFee);

    // Check if user has enough balance (but don't lock yet)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { balanceTon: true },
    });

    if (!user || user.balanceTon.lessThan(totalRequired)) {
      throw new BadRequestException(
        `Insufficient balance. Required: ${totalRequired.toString()} TON (including ${PLATFORM_FEE_PERCENT}% fee), Available: ${user?.balanceTon.toString() ?? '0'} TON`
      );
    }

    // Sanitize user-provided content
    const sanitizedText = dto.contentText ? sanitizeHtml(dto.contentText) : undefined;
    const sanitizedUrls = dto.contentMediaUrls
      ?.map((url) => sanitizeUrl(url))
      .filter((url): url is string => url !== null) ?? [];

    // Create deal in PENDING status
    const deal = await this.prisma.deal.create({
      data: {
        amount,
        platformFee,
        status: DealStatus.PENDING,
        contentType: dto.contentType,
        contentText: sanitizedText,
        contentMediaUrls: sanitizedUrls,
        scheduledPostTime: dto.scheduledPostTime
          ? new Date(dto.scheduledPostTime)
          : undefined,
        minViewsRequired: dto.minViewsRequired,
        campaignId: dto.campaignId,
        channelId: dto.channelId,
        advertiserId: userId,
        channelOwnerId: channel.ownerId,
      },
    });

    // Record status history
    await this.recordStatusChange(deal.id, null, DealStatus.PENDING, 'Deal request created');

    this.logger.log(`Deal ${deal.id} created by user ${userId} for channel ${channel.title}`);

    this.notificationService.send('DEAL_CREATED', channel.ownerId, {
      dealId: deal.id,
      channelId: channel.id,
      channelTitle: channel.title,
      amount: amount.toString(),
      miniAppPath: `/deals/${deal.id}`,
    });

    return this.mapToResponse(deal);
  }

  async findByUser(
    userId: string,
    filters: DealFiltersDto
  ): Promise<PaginatedDealsDto> {
    const { page = 1, limit = 20, status, campaignId, channelId, role } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.DealWhereInput = {};

    if (role === 'advertiser') {
      where.advertiserId = userId;
    } else if (role === 'channel_owner') {
      where.channelOwnerId = userId;
    } else {
      where.OR = [{ advertiserId: userId }, { channelOwnerId: userId }];
    }

    if (status) {
      where.status = status;
    }
    if (campaignId) {
      where.campaignId = campaignId;
    }
    if (channelId) {
      where.channelId = channelId;
    }

    const [deals, total] = await Promise.all([
      this.prisma.deal.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          channel: { select: { title: true, username: true } },
          campaign: { select: { title: true } },
        },
      }),
      this.prisma.deal.count({ where }),
    ]);

    return {
      items: deals.map((d) => this.mapToResponse(d)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findById(id: string, userId: string): Promise<DealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
      include: {
        channel: { select: { title: true, username: true } },
        campaign: { select: { title: true } },
      },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.advertiserId !== userId && deal.channelOwnerId !== userId) {
      const isAdmin = await this.channelAdminsService.isChannelAdmin(deal.channelId, userId);
      if (!isAdmin) {
        throw new ForbiddenException('Not authorized to view this deal');
      }
    }

    return this.mapToResponse(deal);
  }

  /**
   * Владелец канала одобряет сделку
   * Автоматически: блокировка средств → переход в SCHEDULED или POSTED
   */
  async approveDeal(id: string, userId: string): Promise<DealResponseDto> {
    const deal = await this.getDealWithAuth(id, userId, 'channel_owner');

    if (deal.status !== DealStatus.PENDING) {
      throw new BadRequestException(`Cannot approve deal with status ${deal.status}`);
    }

    // Re-verify bot admin status in the channel before financial operations
    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { telegramId: true, username: true, title: true },
    });

    if (channel) {
      const botAdminOk = await this.verifyBotIsChannelAdmin(channel.telegramId, channel.username);
      if (!botAdminOk) {
        const botUsername = await this.getBotUsername();
        throw new BadRequestException(
          `BOT_NOT_ADMIN:${botUsername}`,
        );
      }
    }

    // Get advertiser and check balance
    const advertiser = await this.prisma.user.findUnique({
      where: { id: deal.advertiserId },
      select: { balanceTon: true },
    });

    const totalRequired = deal.amount.add(deal.platformFee);

    if (!advertiser || advertiser.balanceTon.lessThan(totalRequired)) {
      throw new BadRequestException(
        `Advertiser has insufficient balance. Required: ${totalRequired.toString()} TON`
      );
    }

    const nextStatus = DealStatus.CONTENT_PENDING;

    // Lock funds via EscrowService (balance → frozen + escrow lock transaction)
    await this.escrowService.lockFundsForDeal(
      deal.advertiserId,
      id,
      totalRequired.toString(),
    );

    // Save original content as brief reference
    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: nextStatus,
        briefText: deal.contentText,
        briefMediaUrls: deal.contentMediaUrls,
      },
    });

    await this.recordStatusChange(
      id,
      DealStatus.PENDING,
      nextStatus,
      `Approved by channel owner. Funds locked: ${totalRequired.toString()} TON`,
    );

    this.logger.log(
      `Deal ${id}: Approved by channel owner. Status: ${nextStatus}. Funds locked: ${totalRequired.toString()} TON`
    );

    this.notificationService.send('DEAL_APPROVED', deal.advertiserId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      amount: totalRequired.toString(),
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Владелец канала отклоняет сделку
   */
  async rejectDeal(id: string, userId: string, reason?: string): Promise<DealResponseDto> {
    const deal = await this.getDealWithAuth(id, userId, 'channel_owner');

    if (deal.status !== DealStatus.PENDING) {
      throw new BadRequestException(`Cannot reject deal with status ${deal.status}`);
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.CANCELLED },
    });

    await this.recordStatusChange(
      id,
      DealStatus.PENDING,
      DealStatus.CANCELLED,
      reason || 'Rejected by channel owner'
    );

    this.logger.log(`Deal ${id}: Rejected by channel owner. Reason: ${reason || 'not specified'}`);

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('DEAL_REJECTED', deal.advertiserId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      reason: reason || 'не указана',
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Отмена сделки (доступно рекламодателю до одобрения)
   */
  async cancel(id: string, userId: string): Promise<DealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Only advertiser can cancel before approval
    if (deal.advertiserId !== userId) {
      throw new ForbiddenException('Only advertiser can cancel this deal');
    }

    if (deal.status !== DealStatus.PENDING) {
      throw new BadRequestException(
        `Cannot cancel deal with status ${deal.status}. Only PENDING deals can be cancelled.`
      );
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: { status: DealStatus.CANCELLED },
    });

    await this.recordStatusChange(
      id,
      DealStatus.PENDING,
      DealStatus.CANCELLED,
      'Cancelled by advertiser'
    );

    this.logger.log(`Deal ${id}: Cancelled by advertiser`);

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('DEAL_CANCELLED', deal.channelOwnerId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Открытие спора
   */
  async openDispute(
    id: string,
    userId: string,
    dto: DisputeDealDto
  ): Promise<DealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.advertiserId !== userId && deal.channelOwnerId !== userId) {
      throw new ForbiddenException('Not authorized');
    }

    // Can only dispute SCHEDULED or POSTED deals
    if (![DealStatus.SCHEDULED, DealStatus.POSTED].includes(deal.status as DealStatus)) {
      throw new BadRequestException(
        `Cannot dispute deal with status ${deal.status}`
      );
    }

    const role = deal.advertiserId === userId ? 'advertiser' : 'channel_owner';

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.DISPUTED,
        disputeReason: dto.reason,
        disputeDescription: dto.description,
      },
    });

    await this.recordStatusChange(
      id,
      deal.status as DealStatus,
      DealStatus.DISPUTED,
      `Dispute opened by ${role}: ${dto.reason}`
    );

    this.logger.log(`Deal ${id}: Dispute opened by ${role}. Reason: ${dto.reason}`);

    const counterpartyId = deal.advertiserId === userId
      ? deal.channelOwnerId
      : deal.advertiserId;

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('DEAL_DISPUTED', counterpartyId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      reason: dto.reason,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Получить доступные действия для сделки
   */
  async getAvailableActions(
    id: string,
    userId: string
  ): Promise<{ actions: DealAction[] }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    let role: 'advertiser' | 'channel_owner';
    if (deal.advertiserId === userId) {
      role = 'advertiser';
    } else if (deal.channelOwnerId === userId) {
      role = 'channel_owner';
    } else {
      const isAdmin = await this.channelAdminsService.isChannelAdmin(deal.channelId, userId);
      if (isAdmin) {
        role = 'channel_owner';
      } else {
        throw new ForbiddenException('Not authorized');
      }
    }

    const actions = this.stateMachine.getAvailableActions(
      deal.status as DealStatus,
      role
    );

    return { actions };
  }

  // ============ CONTENT APPROVAL METHODS ============

  /**
   * Channel owner submits content draft for advertiser review
   */
  async submitContent(id: string, userId: string, dto: SubmitContentDto): Promise<DealResponseDto> {
    const deal = await this.getDealWithAuth(id, userId, 'channel_owner');

    if (deal.status !== DealStatus.CONTENT_PENDING) {
      throw new BadRequestException(`Cannot submit content for deal with status ${deal.status}`);
    }

    const sanitizedText = dto.contentText ? sanitizeHtml(dto.contentText) : undefined;
    const sanitizedUrls = dto.contentMediaUrls
      ?.map((url) => sanitizeUrl(url))
      .filter((url): url is string => url !== null) ?? [];

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.CONTENT_SUBMITTED,
        draftContentText: sanitizedText,
        draftContentMediaUrls: sanitizedUrls,
      },
    });

    await this.recordStatusChange(id, DealStatus.CONTENT_PENDING, DealStatus.CONTENT_SUBMITTED, 'Content draft submitted');

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('CONTENT_SUBMITTED', deal.advertiserId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Advertiser approves content → CONTENT_APPROVED → auto-transitions to SCHEDULED/POSTED
   */
  async approveContent(id: string, userId: string): Promise<DealResponseDto> {
    const deal = await this.getDealWithAuth(id, userId, 'advertiser');

    if (deal.status !== DealStatus.CONTENT_SUBMITTED) {
      throw new BadRequestException(`Cannot approve content for deal with status ${deal.status}`);
    }

    // Copy draft content to final content fields
    const now = new Date();
    const hasScheduledTime = deal.scheduledPostTime && deal.scheduledPostTime > now;
    const nextStatus = hasScheduledTime ? DealStatus.SCHEDULED : DealStatus.POSTED;

    const verificationDeadline = new Date();
    if (hasScheduledTime) {
      verificationDeadline.setTime(deal.scheduledPostTime!.getTime() + 48 * 60 * 60 * 1000);
    } else {
      verificationDeadline.setHours(verificationDeadline.getHours() + 48);
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: nextStatus,
        contentText: deal.draftContentText,
        contentMediaUrls: deal.draftContentMediaUrls,
        verificationDeadline,
        actualPostTime: hasScheduledTime ? undefined : new Date(),
      },
    });

    await this.recordStatusChange(id, DealStatus.CONTENT_SUBMITTED, nextStatus, 'Content approved by advertiser');

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('CONTENT_APPROVED', deal.channelOwnerId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Advertiser rejects content → back to CONTENT_PENDING for revision
   */
  async rejectContent(id: string, userId: string, dto: RejectContentDto): Promise<DealResponseDto> {
    const deal = await this.getDealWithAuth(id, userId, 'advertiser');

    if (deal.status !== DealStatus.CONTENT_SUBMITTED) {
      throw new BadRequestException(`Cannot reject content for deal with status ${deal.status}`);
    }

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.CONTENT_PENDING,
        contentRevisionNote: dto.revisionNote,
        contentRevisionCount: { increment: 1 },
      },
    });

    await this.recordStatusChange(id, DealStatus.CONTENT_SUBMITTED, DealStatus.CONTENT_PENDING, `Content revision requested: ${dto.revisionNote}`);

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('CONTENT_REJECTED', deal.channelOwnerId, {
      dealId: id,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      reason: dto.revisionNote,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  // ============ ADVERTISER BRIEFS ============

  /**
   * Channel owner applies to a public campaign (reverse flow)
   */
  async applyToCampaign(userId: string, dto: ApplyToCampaignDto): Promise<DealResponseDto> {
    // Verify campaign is public and active
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: dto.campaignId },
    });

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const campaignAny = campaign as any;
    if (!campaignAny.isPublic || campaign.status !== 'ACTIVE') {
      throw new BadRequestException('Campaign is not available for applications');
    }

    // Verify channel ownership (via ChannelAdminsService or direct ownership)
    const channel = await this.prisma.channel.findUnique({
      where: { id: dto.channelId },
    });

    if (!channel || channel.status !== 'ACTIVE') {
      throw new BadRequestException('Channel not found or not active');
    }

    if (channel.ownerId !== userId) {
      const isAdmin = await this.channelAdminsService.isChannelAdmin(dto.channelId, userId);
      if (!isAdmin) {
        throw new ForbiddenException('Not authorized to use this channel');
      }
    }

    // Cannot apply to own campaign
    if (campaign.advertiserId === userId) {
      throw new BadRequestException('Cannot apply to your own campaign');
    }

    // Check minSubscribers requirement
    if (campaignAny.minSubscribers && channel.subscriberCount < campaignAny.minSubscribers) {
      throw new BadRequestException(`Channel needs at least ${campaignAny.minSubscribers} subscribers`);
    }

    // Determine amount
    const amount = dto.proposedAmount
      ? new Prisma.Decimal(dto.proposedAmount)
      : (campaignAny.maxBudgetPerDeal ? new Prisma.Decimal(campaignAny.maxBudgetPerDeal) : channel.pricePerPost);

    const platformFee = amount.mul(PLATFORM_FEE_PERCENT).div(100);

    // Create deal in PENDING status (advertiser needs to approve)
    const deal = await this.prisma.deal.create({
      data: {
        amount,
        platformFee,
        status: DealStatus.PENDING,
        contentType: ContentType.TEXT,
        contentText: dto.applicationNote,
        campaignId: dto.campaignId,
        channelId: dto.channelId,
        advertiserId: campaign.advertiserId,
        channelOwnerId: channel.ownerId,
      },
    });

    await this.recordStatusChange(deal.id, null, DealStatus.PENDING, 'Channel owner applied to campaign');

    this.notificationService.send('DEAL_CREATED', campaign.advertiserId, {
      dealId: deal.id,
      channelId: channel.id,
      channelTitle: channel.title,
      amount: amount.toString(),
      miniAppPath: `/deals/${deal.id}`,
    });

    return this.mapToResponse(deal);
  }

  // ============ ADMIN METHODS ============

  /**
   * Разрешение спора в пользу владельца канала (выплата)
   */
  async resolveDisputeRelease(id: string, adminId: string): Promise<DealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.status !== DealStatus.DISPUTED) {
      throw new BadRequestException('Deal is not in disputed status');
    }

    const totalFrozen = deal.amount.add(deal.platformFee);

    // Release funds via EscrowService (frozen → channel owner balance + fee)
    await this.escrowService.releaseFundsFromDeal(
      id,
      deal.advertiserId,
      deal.channelOwnerId,
      totalFrozen.toString(),
      deal.platformFee.toString(),
    );

    const appealDeadline = new Date(Date.now() + APPEAL_WINDOW_DISPUTE_MS);

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.RELEASED,
        resolvedByAdminId: adminId,
        appealDeadline,
      },
    });

    // Update campaign spentBudget
    await this.prisma.campaign.update({
      where: { id: deal.campaignId },
      data: { spentBudget: { increment: deal.amount } },
    });

    // Check if campaign budget is running low (>=80% spent)
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: deal.campaignId },
      select: { id: true, title: true, totalBudget: true, spentBudget: true, advertiserId: true },
    });
    if (campaign && campaign.totalBudget.greaterThan(0)) {
      const spentPercent = campaign.spentBudget.div(campaign.totalBudget).mul(100).toNumber();
      if (spentPercent >= 80) {
        this.notificationService.send('CAMPAIGN_BUDGET_LOW', campaign.advertiserId, {
          campaignId: campaign.id,
          campaignTitle: campaign.title,
          budgetPercentRemaining: 100 - Math.round(spentPercent),
          miniAppPath: `/campaigns/${campaign.id}`,
        });
      }
    }

    // Freeze the net amount on channel owner's balance for appeal window
    const netAmount = deal.amount.sub(deal.platformFee);
    await this.prisma.user.update({
      where: { id: deal.channelOwnerId },
      data: { appealFrozenTon: { increment: netAmount } },
    });

    await this.recordStatusChange(id, DealStatus.DISPUTED, DealStatus.RELEASED, `Dispute resolved by admin: released to channel owner`);

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.sendToMany(
      'DEAL_RESOLVED_RELEASE',
      [deal.advertiserId, deal.channelOwnerId],
      {
        dealId: id,
        channelId: deal.channelId,
        channelTitle: channel?.title,
        miniAppPath: `/deals/${id}`,
      },
    );

    // Notify about appeal window
    this.notificationService.send('APPEAL_WINDOW_OPENED', deal.advertiserId, {
      dealId: id,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  /**
   * Разрешение спора в пользу рекламодателя (возврат)
   */
  async resolveDisputeRefund(id: string, adminId: string): Promise<DealResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.status !== DealStatus.DISPUTED) {
      throw new BadRequestException('Deal is not in disputed status');
    }

    const totalFrozen = deal.amount.add(deal.platformFee);

    // Refund funds via EscrowService (frozen → advertiser balance)
    await this.escrowService.refundFundsFromDeal(
      id,
      deal.advertiserId,
      totalFrozen.toString(),
    );

    const appealDeadline = new Date(Date.now() + APPEAL_WINDOW_DISPUTE_MS);

    const updated = await this.prisma.deal.update({
      where: { id },
      data: {
        status: DealStatus.REFUNDED,
        resolvedByAdminId: adminId,
        appealDeadline,
      },
    });

    // Freeze the total refunded amount on advertiser's balance for appeal window
    await this.prisma.user.update({
      where: { id: deal.advertiserId },
      data: { appealFrozenTon: { increment: totalFrozen } },
    });

    await this.recordStatusChange(id, DealStatus.DISPUTED, DealStatus.REFUNDED, `Dispute resolved by admin: refunded to advertiser`);

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.sendToMany(
      'DEAL_RESOLVED_REFUND',
      [deal.advertiserId, deal.channelOwnerId],
      {
        dealId: id,
        channelId: deal.channelId,
        channelTitle: channel?.title,
        miniAppPath: `/deals/${id}`,
      },
    );

    // Notify about appeal window
    this.notificationService.send('APPEAL_WINDOW_OPENED', deal.channelOwnerId, {
      dealId: id,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${id}`,
    });

    return this.mapToResponse(updated);
  }

  // ============ PRIVATE HELPERS ============

  private async getBotUsername(): Promise<string> {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return 'bot';
    try {
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const data = await res.json() as { ok: boolean; result?: { username: string } };
      return data.ok && data.result ? `@${data.result.username}` : 'bot';
    } catch {
      return 'bot';
    }
  }

  /**
   * Verify that the platform bot is still an admin of the channel via Telegram Bot API.
   * Used as a pre-check before financial operations (escrow lock).
   */
  private async verifyBotIsChannelAdmin(
    telegramId: bigint | number,
    username: string | null,
  ): Promise<boolean> {
    const botToken = process.env.BOT_TOKEN;
    if (!botToken) return true; // Skip check if bot token not configured

    let chatId: number | string = Number(telegramId);
    if (chatId > 0) {
      chatId = username ? `@${username}` : -chatId;
    }

    try {
      // Get bot's own user ID first
      const meRes = await fetch(`https://api.telegram.org/bot${botToken}/getMe`);
      const meData = await meRes.json() as { ok: boolean; result?: { id: number } };
      if (!meData.ok || !meData.result) return true; // Can't verify, allow

      const botUserId = meData.result.id;

      // Check bot's membership in the channel
      const res = await fetch(`https://api.telegram.org/bot${botToken}/getChatMember`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, user_id: botUserId }),
      });
      const data = await res.json() as {
        ok: boolean;
        result?: { status: string };
      };

      if (!data.ok || !data.result) return false;

      return ['administrator', 'creator'].includes(data.result.status);
    } catch (error) {
      this.logger.warn(`Bot admin verification failed for channel ${telegramId}: ${error}`);
      return true; // On network error, don't block the operation
    }
  }

  private async getDealWithAuth(
    id: string,
    userId: string,
    expectedRole: 'advertiser' | 'channel_owner'
  ): Promise<Deal> {
    const deal = await this.prisma.deal.findUnique({
      where: { id },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    const isAdvertiser = deal.advertiserId === userId;
    const isChannelOwner = deal.channelOwnerId === userId;

    if (expectedRole === 'advertiser' && !isAdvertiser) {
      throw new ForbiddenException('Only advertiser can perform this action');
    }

    if (expectedRole === 'channel_owner' && !isChannelOwner) {
      // Also allow channel admins
      const isAdmin = await this.channelAdminsService.isChannelAdmin(deal.channelId, userId);
      if (!isAdmin) {
        throw new ForbiddenException('Only channel owner or admin can perform this action');
      }
    }

    return deal;
  }

  private async recordStatusChange(
    dealId: string,
    fromStatus: DealStatus | null,
    toStatus: DealStatus,
    reason?: string
  ): Promise<void> {
    await this.prisma.dealStatusHistory.create({
      data: {
        dealId,
        fromStatus,
        toStatus,
        reason,
      },
    });
  }

  private mapToResponse(deal: Deal & { channel?: { title: string; username: string | null }; campaign?: { title: string } }): DealResponseDto {
    const d = deal as any;
    return {
      id: deal.id,
      amount: deal.amount.toString(),
      platformFee: deal.platformFee.toString(),
      status: deal.status as DealStatus,
      contentType: deal.contentType as ContentType,
      contentText: deal.contentText ?? undefined,
      contentMediaUrls: deal.contentMediaUrls,
      postUrl: deal.postUrl ?? undefined,
      scheduledPostTime: deal.scheduledPostTime?.toISOString(),
      actualPostTime: deal.actualPostTime?.toISOString(),
      minViewsRequired: deal.minViewsRequired ?? undefined,
      viewsAtVerification: deal.viewsAtVerification ?? undefined,
      verificationDeadline: deal.verificationDeadline?.toISOString(),
      disputeReason: deal.disputeReason as DisputeReason | undefined,
      disputeDescription: deal.disputeDescription ?? undefined,
      campaignId: deal.campaignId,
      channelId: deal.channelId,
      advertiserId: deal.advertiserId,
      channelOwnerId: deal.channelOwnerId,
      channelTitle: deal.channel?.title,
      channelUsername: deal.channel?.username ?? undefined,
      campaignTitle: deal.campaign?.title,
      briefText: d.briefText ?? undefined,
      briefMediaUrls: d.briefMediaUrls ?? undefined,
      draftContentText: d.draftContentText ?? undefined,
      draftContentMediaUrls: d.draftContentMediaUrls ?? undefined,
      contentRevisionNote: d.contentRevisionNote ?? undefined,
      contentRevisionCount: d.contentRevisionCount ?? 0,
      adFormat: d.adFormat ?? undefined,
      createdAt: deal.createdAt.toISOString(),
      updatedAt: deal.updatedAt.toISOString(),
    };
  }
}
