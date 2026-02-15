import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateReviewDto, ReviewResponseDto, ReviewsListDto } from './dto/review.dto';

@Injectable()
export class ReviewsService {
  constructor(private prisma: PrismaService) {}

  async create(
    channelId: string,
    userId: string,
    dto: CreateReviewDto
  ): Promise<ReviewResponseDto> {
    // Check channel exists
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    // Check deal exists and is RELEASED
    const deal = await this.prisma.deal.findUnique({
      where: { id: dto.dealId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    if (deal.channelId !== channelId) {
      throw new BadRequestException('Deal does not belong to this channel');
    }

    if (deal.status !== 'RELEASED') {
      throw new BadRequestException('Can only review after deal is completed (RELEASED)');
    }

    // Check user is the advertiser of this deal
    if (deal.advertiserId !== userId) {
      throw new ForbiddenException('Only the advertiser can leave a review');
    }

    // Check if review already exists for this deal
    const existingReview = await this.prisma.channelReview.findFirst({
      where: {
        channelId,
        reviewerId: userId,
        dealId: dto.dealId,
      },
    });

    if (existingReview) {
      throw new ConflictException('You have already reviewed this deal');
    }

    // Create review
    const review = await this.prisma.channelReview.create({
      data: {
        channelId,
        reviewerId: userId,
        dealId: dto.dealId,
        rating: dto.rating,
        comment: dto.comment,
      },
    });

    // Update channel rating
    await this.updateChannelRating(channelId);

    // Get reviewer info
    const reviewer = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { firstName: true, lastName: true, username: true },
    });

    return this.mapToResponse(review, reviewer);
  }

  async findByChannel(channelId: string): Promise<ReviewsListDto> {
    // Check channel exists
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
    });

    if (!channel) {
      throw new NotFoundException('Channel not found');
    }

    const reviews = await this.prisma.channelReview.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      include: {
        channel: false,
      },
    });

    // Get reviewer info for all reviews
    const reviewerIds = [...new Set(reviews.map((r) => r.reviewerId))];
    const reviewers = await this.prisma.user.findMany({
      where: { id: { in: reviewerIds } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });

    const reviewerMap = new Map(reviewers.map((r) => [r.id, r]));

    const items = reviews.map((review) =>
      this.mapToResponse(review, reviewerMap.get(review.reviewerId))
    );

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    return {
      items,
      total: reviews.length,
      avgRating: Math.round(avgRating * 10) / 10,
    };
  }

  async checkCanReview(
    channelId: string,
    userId: string,
    dealId: string
  ): Promise<{ canReview: boolean; reason?: string }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return { canReview: false, reason: 'Deal not found' };
    }

    if (deal.channelId !== channelId) {
      return { canReview: false, reason: 'Deal does not belong to this channel' };
    }

    if (deal.status !== 'RELEASED') {
      return { canReview: false, reason: 'Deal is not completed yet' };
    }

    if (deal.advertiserId !== userId) {
      return { canReview: false, reason: 'Only the advertiser can review' };
    }

    const existingReview = await this.prisma.channelReview.findFirst({
      where: {
        channelId,
        reviewerId: userId,
        dealId,
      },
    });

    if (existingReview) {
      return { canReview: false, reason: 'Already reviewed' };
    }

    return { canReview: true };
  }

  private async updateChannelRating(channelId: string): Promise<void> {
    const reviews = await this.prisma.channelReview.findMany({
      where: { channelId },
      select: { rating: true },
    });

    const avgRating =
      reviews.length > 0
        ? reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length
        : 0;

    await this.prisma.channel.update({
      where: { id: channelId },
      data: {
        rating: Math.round(avgRating * 10) / 10,
        reviewsCount: reviews.length,
      },
    });
  }

  private mapToResponse(
    review: any,
    reviewer?: { firstName?: string | null; lastName?: string | null; username?: string | null } | null
  ): ReviewResponseDto {
    const reviewerName = reviewer
      ? [reviewer.firstName, reviewer.lastName].filter(Boolean).join(' ') ||
        reviewer.username ||
        'Anonymous'
      : 'Anonymous';

    return {
      id: review.id,
      channelId: review.channelId,
      reviewerId: review.reviewerId,
      reviewerName,
      dealId: review.dealId ?? undefined,
      rating: review.rating,
      comment: review.comment ?? undefined,
      createdAt: review.createdAt.toISOString(),
    };
  }
}
