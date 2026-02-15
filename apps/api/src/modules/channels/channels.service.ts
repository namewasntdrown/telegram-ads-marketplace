import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TelegramBotService } from '../../common/services/telegram-bot.service';
import { StorageService } from '../../common/storage/storage.service';
import { ChannelStatus, MAX_CHANNELS_PER_USER } from '@tam/shared-types';
import { QUEUE_NAMES, ChannelStatsJobData, DEFAULT_JOB_OPTIONS } from '@tam/queue-contracts';
import { NotificationService } from '../../common/notification/notification.service';
import {
  CreateChannelDto,
  CreateChannelByLinkDto,
  UpdateChannelDto,
  ChannelFiltersDto,
  ChannelResponseDto,
  PaginatedChannelsDto,
  BoostChannelDto,
  UpdateChannelStatusDto,
} from './dto/channel.dto';
import { Prisma, Channel } from '@tam/prisma-client';

@Injectable()
export class ChannelsService {
  private readonly logger = new Logger(ChannelsService.name);

  constructor(
    private prisma: PrismaService,
    private telegramBot: TelegramBotService,
    private storageService: StorageService,
    @InjectQueue(QUEUE_NAMES.CHANNEL_STATS) private channelStatsQueue: Queue<ChannelStatsJobData>,
    private notificationService: NotificationService,
  ) {}

  parseChannelLink(link: string): string {
    // Handle @username format
    if (link.startsWith('@')) {
      return link.slice(1);
    }

    // Handle t.me/username or https://t.me/username
    const tmeMatch = link.match(/(?:https?:\/\/)?t\.me\/([a-zA-Z0-9_]+)/);
    if (tmeMatch && tmeMatch[1]) {
      return tmeMatch[1];
    }

    // Handle telegram.me/username or https://telegram.me/username
    const telegramMeMatch = link.match(/(?:https?:\/\/)?telegram\.me\/([a-zA-Z0-9_]+)/);
    if (telegramMeMatch && telegramMeMatch[1]) {
      return telegramMeMatch[1];
    }

    throw new BadRequestException(
      'Invalid channel link format. Use @username, t.me/username, or https://t.me/username'
    );
  }

  async createByLink(userId: string, dto: CreateChannelByLinkDto): Promise<ChannelResponseDto> {
    // Check user's channel limit
    const channelCount = await this.prisma.channel.count({
      where: { ownerId: userId },
    });

    if (channelCount >= MAX_CHANNELS_PER_USER) {
      throw new BadRequestException(
        `Maximum ${MAX_CHANNELS_PER_USER} channels allowed per user`
      );
    }

    const username = this.parseChannelLink(dto.link);

    // Check if channel already exists by username
    const existing = await this.prisma.channel.findFirst({
      where: { username },
    });

    if (existing) {
      throw new BadRequestException('Channel already registered');
    }

    // Generate a unique negative telegramId as placeholder until MTProto worker resolves the real ID
    // Using negative numbers to avoid collision with real Telegram IDs
    const placeholderTelegramId = BigInt(-Date.now()) - BigInt(Math.floor(Math.random() * 1000000));

    const channel = await this.prisma.channel.create({
      data: {
        telegramId: placeholderTelegramId,
        username,
        title: 'Pending verification', // Will be updated by MTProto worker
        pricePerPost: new Prisma.Decimal(dto.pricePerPost),
        categories: dto.categories,
        ownerId: userId,
        status: ChannelStatus.PENDING,
      },
    });

    // Queue job for MTProto worker to fetch real channel stats
    await this.channelStatsQueue.add(
      'fetch-new-channel-stats',
      {
        channelId: channel.id,
        telegramChannelId: `@${username}`,
      },
      DEFAULT_JOB_OPTIONS
    );
    this.logger.log(`Queued initial stats fetch for new channel ${channel.id} (@${username})`);

    return this.mapToResponse(channel);
  }

  async create(userId: string, dto: CreateChannelDto): Promise<ChannelResponseDto> {
    // Check user's channel limit
    const channelCount = await this.prisma.channel.count({
      where: { ownerId: userId },
    });

    if (channelCount >= MAX_CHANNELS_PER_USER) {
      throw new BadRequestException(
        `Maximum ${MAX_CHANNELS_PER_USER} channels allowed per user`
      );
    }

    // Parse telegram ID
    let telegramId: bigint;
    if (dto.telegramId.startsWith('@')) {
      // For now, require numeric ID. MTProto worker will resolve usernames
      throw new BadRequestException(
        'Please provide numeric channel ID. Username resolution coming soon.'
      );
    } else {
      telegramId = BigInt(dto.telegramId);
    }

    // Check if channel already exists
    const existing = await this.prisma.channel.findUnique({
      where: { telegramId },
    });

    if (existing) {
      throw new BadRequestException('Channel already registered');
    }

    const channel = await this.prisma.channel.create({
      data: {
        telegramId,
        title: 'Pending verification', // Will be updated by MTProto worker
        pricePerPost: new Prisma.Decimal(dto.pricePerPost),
        categories: dto.categories,
        ownerId: userId,
        status: ChannelStatus.PENDING,
      },
    });

    return this.mapToResponse(channel);
  }

  async findAll(filters: ChannelFiltersDto): Promise<PaginatedChannelsDto> {
    const { page = 1, limit = 20, ...rest } = filters;
    const skip = (page - 1) * limit;

    const where: Prisma.ChannelWhereInput = {
      status: rest.status ?? ChannelStatus.ACTIVE,
    };

    if (rest.categories?.length) {
      where.categories = { hasSome: rest.categories };
    }

    if (rest.minSubscribers !== undefined || rest.maxSubscribers !== undefined) {
      where.subscriberCount = {
        ...(rest.minSubscribers !== undefined && { gte: rest.minSubscribers }),
        ...(rest.maxSubscribers !== undefined && { lte: rest.maxSubscribers }),
      };
    }

    if (rest.minPrice !== undefined || rest.maxPrice !== undefined) {
      where.pricePerPost = {
        ...(rest.minPrice !== undefined && {
          gte: new Prisma.Decimal(rest.minPrice),
        }),
        ...(rest.maxPrice !== undefined && {
          lte: new Prisma.Decimal(rest.maxPrice),
        }),
      };
    }

    if (rest.language) {
      where.language = rest.language;
    }

    const now = new Date();

    // Fetch boosted channels first (boostUntil > now), sorted by boostAmount DESC
    // Then non-boosted channels sorted by subscriberCount DESC
    const [channels, total] = await Promise.all([
      this.prisma.$queryRaw<Channel[]>`
        SELECT * FROM "Channel"
        WHERE status = ${where.status}::text::"ChannelStatus"
        ${rest.categories?.length ? Prisma.sql`AND categories && ${rest.categories}` : Prisma.empty}
        ${rest.minSubscribers !== undefined ? Prisma.sql`AND "subscriberCount" >= ${rest.minSubscribers}` : Prisma.empty}
        ${rest.maxSubscribers !== undefined ? Prisma.sql`AND "subscriberCount" <= ${rest.maxSubscribers}` : Prisma.empty}
        ${rest.minPrice !== undefined ? Prisma.sql`AND "pricePerPost" >= ${rest.minPrice}::decimal` : Prisma.empty}
        ${rest.maxPrice !== undefined ? Prisma.sql`AND "pricePerPost" <= ${rest.maxPrice}::decimal` : Prisma.empty}
        ${rest.language ? Prisma.sql`AND language = ${rest.language}` : Prisma.empty}
        ORDER BY
          CASE WHEN "boostUntil" > ${now} THEN 0 ELSE 1 END,
          CASE WHEN "boostUntil" > ${now} THEN "boostAmount" END DESC NULLS LAST,
          "subscriberCount" DESC
        LIMIT ${limit}
        OFFSET ${skip}
      `,
      this.prisma.channel.count({ where }),
    ]);

    return {
      items: channels.map((c) => this.mapToResponse(c)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findPending(): Promise<ChannelResponseDto[]> {
    const channels = await this.prisma.channel.findMany({
      where: { status: ChannelStatus.PENDING },
      orderBy: { createdAt: 'asc' },
    });

    return channels.map((c) => this.mapToResponse(c));
  }

  async findById(id: string): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    return this.mapToResponse(channel);
  }

  async findByUser(userId: string): Promise<ChannelResponseDto[]> {
    const channels = await this.prisma.channel.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
    });

    return channels.map((c) => this.mapToResponse(c));
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateChannelDto
  ): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to update this channel');
    }

    const updated = await this.prisma.channel.update({
      where: { id },
      data: {
        ...(dto.pricePerPost && {
          pricePerPost: new Prisma.Decimal(dto.pricePerPost),
        }),
        ...(dto.categories && { categories: dto.categories }),
        ...(dto.description !== undefined && { description: dto.description }),
        // Ad conditions
        ...(dto.adFormats !== undefined && { adFormats: dto.adFormats }),
        ...(dto.postDuration !== undefined && { postDuration: dto.postDuration }),
        ...(dto.restrictions !== undefined && { restrictions: dto.restrictions }),
        ...(dto.allowsNativeAds !== undefined && { allowsNativeAds: dto.allowsNativeAds }),
      },
    });

    return this.mapToResponse(updated);
  }

  async updateStatus(id: string, dto: UpdateChannelStatusDto): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (dto.status === ChannelStatus.REJECTED && !dto.rejectionReason) {
      throw new BadRequestException('Rejection reason is required when rejecting a channel');
    }

    const updated = await this.prisma.channel.update({
      where: { id },
      data: {
        status: dto.status,
        rejectionReason: dto.status === ChannelStatus.REJECTED ? dto.rejectionReason : null,
      },
    });

    if (dto.status === ChannelStatus.ACTIVE) {
      this.notificationService.send('CHANNEL_APPROVED', channel.ownerId, {
        channelId: id,
        channelTitle: channel.title,
        miniAppPath: `/channels/${id}`,
      });
    } else if (dto.status === ChannelStatus.REJECTED) {
      this.notificationService.send('CHANNEL_REJECTED', channel.ownerId, {
        channelId: id,
        channelTitle: channel.title,
        reason: dto.rejectionReason || 'не указана',
        miniAppPath: `/channels/${id}`,
      });
    }

    return this.mapToResponse(updated);
  }

  async boost(id: string, userId: string, dto: BoostChannelDto): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to boost this channel');
    }

    if (channel.status !== ChannelStatus.ACTIVE) {
      throw new BadRequestException('Only active channels can be boosted');
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
    const currentBoostUntil = channel.boostUntil && channel.boostUntil > now
      ? channel.boostUntil
      : now;
    const newBoostUntil = new Date(currentBoostUntil.getTime() + dto.days * 24 * 60 * 60 * 1000);

    // Execute transaction: deduct balance, update channel boost, create transaction record
    const [updated] = await this.prisma.$transaction([
      this.prisma.channel.update({
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
          type: 'BOOST_CHANNEL',
          status: 'CONFIRMED',
          userId,
          metadata: {
            channelId: id,
            days: dto.days,
            amountPerDay: dto.amountPerDay,
          },
        },
      }),
    ]);

    return this.mapToResponse(updated);
  }

  async delete(id: string, userId: string): Promise<void> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
      include: {
        deals: {
          where: {
            status: {
              in: [
                'AWAITING_DEPOSIT',
                'FUNDED',
                'CONTENT_PENDING',
                'CONTENT_SUBMITTED',
                'CONTENT_APPROVED',
                'POSTED',
                'AWAITING_VERIFICATION',
              ],
            },
          },
        },
      },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to delete this channel');
    }

    if (channel.deals.length > 0) {
      throw new BadRequestException(
        'Cannot delete channel with active deals'
      );
    }

    await this.prisma.channel.delete({ where: { id } });
  }

  async updateChannelAvatar(channelId: string, chatId: string | number): Promise<string | null> {
    try {
      // Download avatar from Telegram
      const photoBuffer = await this.telegramBot.downloadChannelPhoto(chatId);
      if (!photoBuffer) {
        this.logger.debug(`No photo available for channel ${channelId}`);
        return null;
      }

      // Upload to MinIO
      const avatarKey = this.storageService.getAvatarKey(channelId);
      await this.storageService.uploadBuffer(photoBuffer, avatarKey, 'image/jpeg');

      // Update channel in database
      await this.prisma.channel.update({
        where: { id: channelId },
        data: {
          avatarKey,
          avatarUpdatedAt: new Date(),
        },
      });

      this.logger.log(`Updated avatar for channel ${channelId}: ${avatarKey}`);
      return avatarKey;
    } catch (error) {
      this.logger.error(`Failed to update avatar for channel ${channelId}: ${error}`);
      return null;
    }
  }

  async getChannelAvatar(channelId: string): Promise<Buffer | null> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { avatarKey: true },
    });

    if (!channel?.avatarKey) {
      return null;
    }

    return this.storageService.getObject(channel.avatarKey);
  }

  async refreshChannelStats(id: string): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Get channel ID for Telegram API (prefer username, fallback to telegramId)
    const chatId = channel.username ? `@${channel.username}` : channel.telegramId.toString();

    try {
      // 1. Get basic info from Telegram Bot API
      const info = await this.telegramBot.getFullChannelInfo(chatId);
      const newSubscriberCount = info?.subscriberCount ?? channel.subscriberCount;

      // 2. Save to ChannelStats history
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      await this.prisma.channelStats.upsert({
        where: {
          channelId_date: { channelId: id, date: today },
        },
        create: {
          channelId: id,
          date: today,
          subscriberCount: newSubscriberCount,
          avgViews: channel.avgViews,
          postsCount: 0,
          engagement: 0,
        },
        update: {
          subscriberCount: newSubscriberCount,
        },
      });

      // 3. Calculate subscriber growth from history
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const monthAgo = new Date();
      monthAgo.setDate(monthAgo.getDate() - 30);

      const [weekStats, monthStats] = await Promise.all([
        this.prisma.channelStats.findFirst({
          where: { channelId: id, date: { lte: weekAgo } },
          orderBy: { date: 'desc' },
        }),
        this.prisma.channelStats.findFirst({
          where: { channelId: id, date: { lte: monthAgo } },
          orderBy: { date: 'desc' },
        }),
      ]);

      const subscriberGrowthWeek = weekStats
        ? newSubscriberCount - weekStats.subscriberCount
        : 0;
      const subscriberGrowthMonth = monthStats
        ? newSubscriberCount - monthStats.subscriberCount
        : 0;

      // 4. Calculate deal statistics from database
      const [completedDeals, totalFinishedDeals, reviews] = await Promise.all([
        this.prisma.deal.count({
          where: { channelId: id, status: 'RELEASED' },
        }),
        this.prisma.deal.count({
          where: {
            channelId: id,
            status: { in: ['RELEASED', 'CANCELLED', 'DISPUTED', 'REFUNDED'] },
          },
        }),
        this.prisma.channelReview.findMany({
          where: { channelId: id },
          select: { rating: true },
        }),
      ]);

      const successRate = totalFinishedDeals > 0
        ? (completedDeals / totalFinishedDeals) * 100
        : 100; // Default 100% if no deals yet

      // 5. Calculate average rating
      const avgRating = reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

      // 6. Calculate engagement rate (views / subscribers * 100)
      const engagementRate = newSubscriberCount > 0 && channel.avgViews > 0
        ? Math.min((channel.avgViews / newSubscriberCount) * 100, 100)
        : 0;

      // 7. Update channel with all stats
      const updated = await this.prisma.channel.update({
        where: { id },
        data: {
          title: info?.title ?? channel.title,
          username: info?.username ?? channel.username,
          description: info?.description ?? channel.description,
          subscriberCount: newSubscriberCount,
          avatarUrl: info?.avatarUrl ?? channel.avatarUrl,
          engagementRate: Math.round(engagementRate * 10) / 10,
          subscriberGrowthWeek,
          subscriberGrowthMonth,
          completedDealsCount: completedDeals,
          successRate: Math.round(successRate * 10) / 10,
          rating: Math.round(avgRating * 10) / 10,
          reviewsCount: reviews.length,
        },
      });

      this.logger.log(
        `Refreshed stats for channel ${id}: ${newSubscriberCount} subscribers, ` +
        `${completedDeals} deals, ${avgRating.toFixed(1)} rating`
      );

      // 8. Update avatar in MinIO storage (download and store permanently)
      await this.updateChannelAvatar(id, chatId);

      // Queue job for MTProto worker to get detailed stats (avg views, engagement)
      // Only if channel has a valid telegramId (not placeholder)
      if (channel.telegramId > 0) {
        await this.channelStatsQueue.add(
          'update-channel-stats',
          {
            channelId: id,
            telegramChannelId: channel.username
              ? `@${channel.username}`
              : channel.telegramId.toString(),
          },
          DEFAULT_JOB_OPTIONS
        );
        this.logger.log(`Queued MTProto stats update for channel ${id}`);
      }

      return this.mapToResponse(updated);
    } catch (error) {
      this.logger.error(`Failed to refresh channel stats: ${error}`);
      throw new BadRequestException('Failed to refresh channel statistics');
    }
  }

  private mapToResponse(channel: Channel): ChannelResponseDto {
    const now = new Date();
    const isBoosted = channel.boostUntil !== null && channel.boostUntil > now;
    const ch = channel as any; // For accessing new fields

    // Prefer permanent MinIO URL over temporary Telegram URL
    const avatarUrl = this.storageService.getAvatarUrl(ch.avatarKey) ?? ch.avatarUrl ?? undefined;

    return {
      id: channel.id,
      telegramId: channel.telegramId.toString(),
      username: channel.username ?? undefined,
      title: channel.title,
      description: channel.description ?? undefined,
      avatarUrl,
      subscriberCount: channel.subscriberCount,
      avgViews: channel.avgViews,
      pricePerPost: channel.pricePerPost.toString(),
      categories: channel.categories,
      language: channel.language,
      status: channel.status as ChannelStatus,
      rejectionReason: channel.rejectionReason ?? undefined,
      boostAmount: channel.boostAmount.toString(),
      boostUntil: channel.boostUntil?.toISOString(),
      isBoosted,
      ownerId: channel.ownerId,
      createdAt: channel.createdAt.toISOString(),
      // Extended statistics
      engagementRate: ch.engagementRate ?? 0,
      subscriberGrowthWeek: ch.subscriberGrowthWeek ?? 0,
      subscriberGrowthMonth: ch.subscriberGrowthMonth ?? 0,
      // Audience
      audienceGeo: ch.audienceGeo ?? undefined,
      peakHours: ch.peakHours ?? undefined,
      // Trust
      channelCreatedAt: ch.channelCreatedAt?.toISOString() ?? undefined,
      completedDealsCount: ch.completedDealsCount ?? 0,
      rating: ch.rating ?? 0,
      reviewsCount: ch.reviewsCount ?? 0,
      successRate: ch.successRate ?? 0,
      avgResponseTime: ch.avgResponseTime ?? undefined,
      // Ad conditions
      adFormats: ch.adFormats ?? [],
      postDuration: ch.postDuration ?? '24H',
      restrictions: ch.restrictions ?? [],
      allowsNativeAds: ch.allowsNativeAds ?? true,
      // Verification & Verified Stats
      isVerified: ch.isVerified ?? false,
      verifiedAt: ch.verifiedAt?.toISOString() ?? undefined,
      hasVerifiedStats: ch.hasVerifiedStats ?? false,
      languageStats: ch.languageStats ?? undefined,
      premiumStats: ch.premiumStats ?? undefined,
      viewSourceStats: ch.viewSourceStats ?? undefined,
      viewsHistory: ch.viewsHistory ?? undefined,
      followersHistory: ch.followersHistory ?? undefined,
      lastStatsUpdate: ch.lastStatsUpdate?.toISOString() ?? undefined,
      telegramGrowthStats: ch.telegramGrowthStats ?? undefined,
    };
  }

  /**
   * Request verification for a channel
   * Queues a job for MTProto worker to check if @sha6kii is admin
   */
  async requestVerification(id: string, userId: string): Promise<ChannelResponseDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    if (channel.ownerId !== userId) {
      throw new ForbiddenException('Not authorized to verify this channel');
    }

    if ((channel as any).isVerified) {
      return this.mapToResponse(channel);
    }

    // Get channel ID for Telegram API
    const chatId = channel.username ? `@${channel.username}` : channel.telegramId.toString();

    // Queue job for MTProto worker to check admin status
    await this.channelStatsQueue.add(
      'verify-channel-admin',
      {
        channelId: id,
        telegramChannelId: chatId,
      },
      {
        ...DEFAULT_JOB_OPTIONS,
        priority: 1, // High priority
      }
    );

    this.logger.log(`Queued verification check for channel ${id}`);

    return this.mapToResponse(channel);
  }
}
