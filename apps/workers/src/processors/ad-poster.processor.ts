import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, NotificationJobData, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';
import { PrismaService } from '../prisma/prisma.service';

const BOT_TOKEN = process.env.BOT_TOKEN;

interface TelegramMessage {
  message_id: number;
  chat: {
    id: number;
    username?: string;
  };
}

interface TelegramResponse {
  ok: boolean;
  result?: TelegramMessage;
  description?: string;
  error_code?: number;
}

@Injectable()
export class AdPosterService {
  private readonly logger = new Logger(AdPosterService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue<NotificationJobData>,
  ) {}

  private async sendTelegramMessage(
    chatId: number | string,
    text: string,
    parseMode: 'HTML' | 'Markdown' = 'HTML',
  ): Promise<TelegramResponse> {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode,
      }),
    });
    return response.json() as Promise<TelegramResponse>;
  }

  private async sendPhoto(
    chatId: number | string,
    photoUrl: string,
    caption?: string,
  ): Promise<TelegramResponse> {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: photoUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });
    return response.json() as Promise<TelegramResponse>;
  }

  private async sendVideo(
    chatId: number | string,
    videoUrl: string,
    caption?: string,
  ): Promise<TelegramResponse> {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendVideo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        video: videoUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });
    return response.json() as Promise<TelegramResponse>;
  }

  private async sendDocument(
    chatId: number | string,
    documentUrl: string,
    caption?: string,
  ): Promise<TelegramResponse> {
    const response = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        document: documentUrl,
        caption,
        parse_mode: 'HTML',
      }),
    });
    return response.json() as Promise<TelegramResponse>;
  }

  private async postAdToChannel(deal: {
    id: string;
    contentType: string;
    contentText: string | null;
    contentMediaUrls: string[];
    channelId: string;
  }): Promise<{ success: boolean; messageId?: number; postUrl?: string; error?: string; channelTitle?: string }> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { telegramId: true, username: true, title: true },
    });

    if (!channel) {
      return { success: false, error: 'Channel not found' };
    }

    let chatId: number | string = Number(channel.telegramId);
    if (chatId > 0) {
      if (channel.username) {
        chatId = `@${channel.username}`;
      } else {
        chatId = -chatId;
      }
    }

    const text = deal.contentText || '';
    const mediaUrls = deal.contentMediaUrls || [];

    let result: TelegramResponse;

    try {
      const firstMediaUrl = mediaUrls[0];

      switch (deal.contentType) {
        case 'PHOTO':
          result = firstMediaUrl
            ? await this.sendPhoto(chatId, firstMediaUrl, text)
            : await this.sendTelegramMessage(chatId, text);
          break;
        case 'VIDEO':
          result = firstMediaUrl
            ? await this.sendVideo(chatId, firstMediaUrl, text)
            : await this.sendTelegramMessage(chatId, text);
          break;
        case 'DOCUMENT':
          result = firstMediaUrl
            ? await this.sendDocument(chatId, firstMediaUrl, text)
            : await this.sendTelegramMessage(chatId, text);
          break;
        case 'TEXT':
        default:
          result = await this.sendTelegramMessage(chatId, text);
          break;
      }

      if (result.ok && result.result) {
        const messageId = result.result.message_id;
        const username = result.result.chat.username || channel.username;
        const postUrl = username ? `https://t.me/${username}/${messageId}` : undefined;
        return { success: true, messageId, postUrl, channelTitle: channel.title };
      } else {
        return { success: false, error: result.description || 'Failed to send message' };
      }
    } catch (error) {
      this.logger.error(`Error posting to channel: ${error}`);
      return { success: false, error: String(error) };
    }
  }

  /**
   * Process SCHEDULED deals ready for posting and POSTED deals missing postUrl.
   * Called by SchedulerProcessor via BullMQ recurring job (every 60s).
   */
  async processScheduledPosts(): Promise<void> {
    if (!BOT_TOKEN) {
      this.logger.debug('BOT_TOKEN not configured, skipping ad posting');
      return;
    }

    const now = new Date();

    const scheduledDeals = await this.prisma.deal.findMany({
      where: {
        status: 'SCHEDULED',
        contentText: { not: null },
        OR: [
          { scheduledPostTime: null },
          { scheduledPostTime: { lte: now } },
        ],
      },
      take: 10,
    });

    const postedWithoutUrl = await this.prisma.deal.findMany({
      where: {
        status: 'POSTED',
        postUrl: null,
        contentText: { not: null },
      },
      take: 5,
    });

    const dealsToPost = [...scheduledDeals, ...postedWithoutUrl];

    if (dealsToPost.length === 0) return;

    this.logger.log(`Found ${dealsToPost.length} deals to post (${scheduledDeals.length} scheduled, ${postedWithoutUrl.length} posted without URL)`);

    for (const deal of dealsToPost) {
      this.logger.log(`Processing deal ${deal.id}...`);

      const result = await this.postAdToChannel({
        id: deal.id,
        contentType: deal.contentType,
        contentText: deal.contentText,
        contentMediaUrls: deal.contentMediaUrls,
        channelId: deal.channelId,
      });

      if (result.success) {
        const verificationDeadline = new Date();
        verificationDeadline.setHours(verificationDeadline.getHours() + 48);

        await this.prisma.deal.update({
          where: { id: deal.id },
          data: {
            status: 'POSTED',
            postMessageId: result.messageId,
            postUrl: result.postUrl,
            actualPostTime: new Date(),
            verificationDeadline,
          },
        });

        await this.prisma.dealStatusHistory.create({
          data: {
            dealId: deal.id,
            fromStatus: deal.status,
            toStatus: 'POSTED',
            reason: 'Auto-posted by bot',
          },
        });

        this.logger.log(`Successfully posted deal ${deal.id}, message ID: ${result.messageId}`);

        this.notificationQueue.add('DEAL_POSTED', {
          type: 'DEAL_POSTED',
          recipientUserId: deal.advertiserId,
          data: {
            dealId: deal.id,
            channelId: deal.channelId,
            channelTitle: result.channelTitle,
            miniAppPath: `/deals/${deal.id}`,
          },
        }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
          this.logger.error(`Failed to queue DEAL_POSTED notification: ${e}`),
        );
      } else {
        this.logger.warn(`Failed to post deal ${deal.id}: ${result.error}`);

        if (result.error?.includes('not enough rights') || result.error?.includes('chat not found')) {
          await this.prisma.dealStatusHistory.create({
            data: {
              dealId: deal.id,
              fromStatus: deal.status,
              toStatus: deal.status,
              reason: `Posting failed: ${result.error}. Bot needs admin rights in channel.`,
            },
          });
        }
      }

      // Small delay between posts to avoid rate limiting
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}
