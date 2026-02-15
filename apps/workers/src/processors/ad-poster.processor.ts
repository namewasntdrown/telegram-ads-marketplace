import { PrismaClient } from '@tam/prisma-client';
import { Queue } from 'bullmq';
import { QUEUE_NAMES, NotificationJobData, NOTIFICATION_JOB_OPTIONS } from '@tam/queue-contracts';

const prisma = new PrismaClient();

const BOT_TOKEN = process.env.BOT_TOKEN;

// Standalone notification queue (not NestJS-managed)
const notificationQueue = new Queue<NotificationJobData>(QUEUE_NAMES.NOTIFICATION, {
  connection: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || undefined,
  },
});

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

async function sendMessage(
  chatId: number | string,
  text: string,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
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

async function sendPhoto(
  chatId: number | string,
  photoUrl: string,
  caption?: string
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

async function sendVideo(
  chatId: number | string,
  videoUrl: string,
  caption?: string
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

async function sendDocument(
  chatId: number | string,
  documentUrl: string,
  caption?: string
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

async function postAdToChannel(deal: {
  id: string;
  contentType: string;
  contentText: string | null;
  contentMediaUrls: string[];
  channelId: string;
}): Promise<{ success: boolean; messageId?: number; postUrl?: string; error?: string; channelTitle?: string }> {
  // Get channel info
  const channel = await prisma.channel.findUnique({
    where: { id: deal.channelId },
    select: { telegramId: true, username: true, title: true },
  });

  if (!channel) {
    return { success: false, error: 'Channel not found' };
  }

  // For channels, use the negative telegram ID
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
        if (firstMediaUrl) {
          result = await sendPhoto(chatId, firstMediaUrl, text);
        } else {
          result = await sendMessage(chatId, text);
        }
        break;

      case 'VIDEO':
        if (firstMediaUrl) {
          result = await sendVideo(chatId, firstMediaUrl, text);
        } else {
          result = await sendMessage(chatId, text);
        }
        break;

      case 'DOCUMENT':
        if (firstMediaUrl) {
          result = await sendDocument(chatId, firstMediaUrl, text);
        } else {
          result = await sendMessage(chatId, text);
        }
        break;

      case 'TEXT':
      default:
        result = await sendMessage(chatId, text);
        break;
    }

    if (result.ok && result.result) {
      const messageId = result.result.message_id;
      const username = result.result.chat.username || channel.username;
      const postUrl = username ? `https://t.me/${username}/${messageId}` : undefined;

      return { success: true, messageId, postUrl, channelTitle: (channel as any).title };
    } else {
      return {
        success: false,
        error: result.description || 'Failed to send message',
      };
    }
  } catch (error) {
    console.error('[AdPoster] Error posting to channel:', error);
    return { success: false, error: String(error) };
  }
}

/**
 * Обрабатывает SCHEDULED сделки:
 * 1. Если scheduledPostTime <= now - постит сразу
 * 2. Если scheduledPostTime в будущем - пропускает
 *
 * Также обрабатывает POSTED сделки без postUrl (одобренные напрямую без расписания)
 */
export async function processAdPosting(): Promise<void> {
  if (!BOT_TOKEN) {
    console.log('[AdPoster] BOT_TOKEN not configured, skipping...');
    return;
  }

  console.log('[AdPoster] Starting ad posting processor...');
  const now = new Date();

  // Найти SCHEDULED сделки, готовые к постингу
  // (scheduledPostTime <= now ИЛИ scheduledPostTime отсутствует)
  const scheduledDeals = await prisma.deal.findMany({
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

  // Также найти POSTED сделки без postUrl (нужно опубликовать)
  const postedWithoutUrl = await prisma.deal.findMany({
    where: {
      status: 'POSTED',
      postUrl: null,
      contentText: { not: null },
    },
    take: 5,
  });

  const dealsToPost = [...scheduledDeals, ...postedWithoutUrl];

  console.log(`[AdPoster] Found ${dealsToPost.length} deals to post (${scheduledDeals.length} scheduled, ${postedWithoutUrl.length} posted without URL)`);

  for (const deal of dealsToPost) {
    console.log(`[AdPoster] Processing deal ${deal.id}...`);

    const result = await postAdToChannel({
      id: deal.id,
      contentType: deal.contentType,
      contentText: deal.contentText,
      contentMediaUrls: deal.contentMediaUrls,
      channelId: deal.channelId,
    });

    if (result.success) {
      // Update deal to POSTED status
      const verificationDeadline = new Date();
      verificationDeadline.setHours(verificationDeadline.getHours() + 48);

      await prisma.deal.update({
        where: { id: deal.id },
        data: {
          status: 'POSTED',
          postMessageId: result.messageId,
          postUrl: result.postUrl,
          actualPostTime: new Date(),
          verificationDeadline,
        },
      });

      // Record status change
      await prisma.dealStatusHistory.create({
        data: {
          dealId: deal.id,
          fromStatus: deal.status,
          toStatus: 'POSTED',
          reason: 'Auto-posted by bot',
        },
      });

      console.log(`[AdPoster] Successfully posted deal ${deal.id}, message ID: ${result.messageId}`);

      // Notify advertiser about successful posting
      notificationQueue.add('DEAL_POSTED', {
        type: 'DEAL_POSTED',
        recipientUserId: deal.advertiserId,
        data: {
          dealId: deal.id,
          channelId: deal.channelId,
          channelTitle: result.channelTitle,
          miniAppPath: `/deals/${deal.id}`,
        },
      }, NOTIFICATION_JOB_OPTIONS).catch((e) =>
        console.error(`[AdPoster] Failed to queue DEAL_POSTED notification: ${e}`),
      );
    } else {
      console.log(`[AdPoster] Failed to post deal ${deal.id}: ${result.error}`);

      // Если бот не админ - логируем ошибку, сделка остаётся в текущем статусе
      // Владелец канала должен сделать бота админом или постить вручную
      if (result.error?.includes('not enough rights') || result.error?.includes('chat not found')) {
        console.log(`[AdPoster] Bot is not admin in channel for deal ${deal.id}. Admin rights required.`);

        // Записываем в историю
        await prisma.dealStatusHistory.create({
          data: {
            dealId: deal.id,
            fromStatus: deal.status,
            toStatus: deal.status, // статус не меняется
            reason: `Posting failed: ${result.error}. Bot needs admin rights in channel.`,
          },
        });
      }
    }

    // Small delay between posts
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  console.log('[AdPoster] Ad posting processor completed');
}

// Run every 10 seconds
export function startAdPosterProcessor(): void {
  console.log('[AdPoster] Ad poster processor started');

  // Run immediately
  processAdPosting().catch(console.error);

  // Then run periodically
  setInterval(() => {
    processAdPosting().catch(console.error);
  }, 10000);
}
