import { Injectable, Logger } from '@nestjs/common';
import { TelegramClientService } from './telegram-client.service';
import { PrismaService } from '../prisma/prisma.service';
import { DealStatus } from '@tam/shared-types';

export interface AutopostResult {
  success: boolean;
  messageId?: number;
  postUrl?: string;
  error?: string;
}

@Injectable()
export class AutopostService {
  private readonly logger = new Logger(AutopostService.name);

  constructor(
    private telegramClient: TelegramClientService,
    private prisma: PrismaService
  ) {}

  async postToChannel(
    dealId: string,
    telegramChannelId: string,
    contentText?: string,
    contentMediaUrls?: string[]
  ): Promise<AutopostResult> {
    if (!this.telegramClient.isInitialized()) {
      return {
        success: false,
        error: 'Telegram client not initialized',
      };
    }

    // Verify deal status
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      return {
        success: false,
        error: 'Deal not found',
      };
    }

    if (deal.status !== DealStatus.CONTENT_APPROVED) {
      return {
        success: false,
        error: `Invalid deal status: ${deal.status}`,
      };
    }

    try {
      const result = await this.telegramClient.sendMessage(
        telegramChannelId,
        contentText ?? '',
        contentMediaUrls
      );

      if (!result) {
        return {
          success: false,
          error: 'Failed to send message',
        };
      }

      // Calculate verification deadline (48 hours from now)
      const verificationDeadline = new Date();
      verificationDeadline.setHours(verificationDeadline.getHours() + 48);

      // Update deal
      await this.prisma.deal.update({
        where: { id: dealId },
        data: {
          status: DealStatus.POSTED,
          postUrl: result.postUrl,
          postMessageId: result.messageId,
          actualPostTime: new Date(),
          verificationDeadline,
        },
      });

      // Record status change
      await this.prisma.dealStatusHistory.create({
        data: {
          dealId,
          fromStatus: DealStatus.CONTENT_APPROVED,
          toStatus: DealStatus.POSTED,
          reason: 'Auto-posted via MTProto',
        },
      });

      this.logger.log(
        `Deal ${dealId} posted: ${result.postUrl} (msg: ${result.messageId})`
      );

      return {
        success: true,
        messageId: result.messageId,
        postUrl: result.postUrl,
      };
    } catch (error) {
      this.logger.error(`Failed to post for deal ${dealId}: ${error}`);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async schedulePost(
    dealId: string,
    telegramChannelId: string,
    scheduledTime: Date,
    contentText?: string,
    contentMediaUrls?: string[]
  ): Promise<boolean> {
    // For scheduled posts, we would use a job queue
    // This is a placeholder for scheduled posting logic
    const now = new Date();

    if (scheduledTime <= now) {
      // Post immediately if scheduled time has passed
      const result = await this.postToChannel(
        dealId,
        telegramChannelId,
        contentText,
        contentMediaUrls
      );
      return result.success;
    }

    // For future scheduled posts, we would add to a delayed job queue
    // This would be handled by the scheduler processor
    this.logger.log(
      `Deal ${dealId} scheduled for ${scheduledTime.toISOString()}`
    );

    return true;
  }
}
