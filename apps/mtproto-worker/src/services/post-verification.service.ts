import { Injectable, Logger } from '@nestjs/common';
import { TelegramClientService } from './telegram-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { DealStatus } from '@tam/shared-types';

export interface VerificationResult {
  verified: boolean;
  viewsCount: number;
  isDeleted: boolean;
  meetsViewRequirement: boolean;
}

@Injectable()
export class PostVerificationService {
  private readonly logger = new Logger(PostVerificationService.name);

  constructor(
    private telegramClient: TelegramClientService,
    private prisma: PrismaService
  ) {}

  async verifyPost(
    _dealId: string, // Reserved for future logging/tracking
    telegramChannelId: string,
    postMessageId: number,
    minViewsRequired?: number
  ): Promise<VerificationResult> {
    if (!this.telegramClient.isInitialized()) {
      throw new Error('Telegram client not initialized');
    }

    // Check if message exists
    const messageExists = await this.telegramClient.checkMessageExists(
      telegramChannelId,
      postMessageId
    );

    if (!messageExists) {
      return {
        verified: false,
        viewsCount: 0,
        isDeleted: true,
        meetsViewRequirement: false,
      };
    }

    // Get current views
    const viewsCount = await this.telegramClient.getMessageViews(
      telegramChannelId,
      postMessageId
    );

    // Check if meets minimum views
    const meetsViewRequirement =
      !minViewsRequired || viewsCount >= minViewsRequired;

    const verified = !minViewsRequired || meetsViewRequirement;

    return {
      verified,
      viewsCount,
      isDeleted: false,
      meetsViewRequirement,
    };
  }

  async processVerification(
    dealId: string,
    telegramChannelId: string,
    postMessageId: number,
    minViewsRequired?: number
  ): Promise<void> {
    const result = await this.verifyPost(
      dealId,
      telegramChannelId,
      postMessageId,
      minViewsRequired
    );

    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      this.logger.error(`Deal not found: ${dealId}`);
      return;
    }

    if (deal.status !== DealStatus.AWAITING_VERIFICATION) {
      this.logger.warn(`Deal ${dealId} not in AWAITING_VERIFICATION status`);
      return;
    }

    if (result.isDeleted) {
      // Post was deleted - this could be a dispute case
      await this.prisma.deal.update({
        where: { id: dealId },
        data: {
          viewsAtVerification: 0,
        },
      });

      this.logger.warn(`Post deleted for deal ${dealId}`);
      return;
    }

    // Update deal with verification results
    await this.prisma.deal.update({
      where: { id: dealId },
      data: {
        viewsAtVerification: result.viewsCount,
        status: result.verified ? DealStatus.VERIFIED : deal.status,
      },
    });

    if (result.verified) {
      await this.prisma.dealStatusHistory.create({
        data: {
          dealId,
          fromStatus: DealStatus.AWAITING_VERIFICATION,
          toStatus: DealStatus.VERIFIED,
          reason: `Verified with ${result.viewsCount} views`,
        },
      });

      this.logger.log(
        `Deal ${dealId} verified with ${result.viewsCount} views`
      );
    } else {
      this.logger.log(
        `Deal ${dealId} not yet verified: ${result.viewsCount}/${minViewsRequired} views`
      );
    }
  }
}
