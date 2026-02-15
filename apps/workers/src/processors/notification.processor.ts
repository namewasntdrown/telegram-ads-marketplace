import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job, UnrecoverableError } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, NotificationJobData, NotificationType } from '@tam/queue-contracts';
import { PrismaService } from '../prisma/prisma.service';

// Simple token-bucket rate limiter (25 msg/sec)
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  constructor(private maxTokens: number = 25) {
    this.tokens = maxTokens;
    this.lastRefill = Date.now();
  }
  async acquire(): Promise<void> {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.maxTokens);
    this.lastRefill = now;
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.maxTokens) * 1000;
      await new Promise((r) => setTimeout(r, waitMs));
      this.tokens = 0;
    } else {
      this.tokens -= 1;
    }
  }
}

interface MessageTemplate {
  text: string;
  buttonText: string;
}

function buildMessage(
  type: NotificationType,
  data: NotificationJobData['data'],
): MessageTemplate {
  const channel = data.channelTitle ?? 'канал';
  const folder = data.folderTitle ?? 'папка';
  const amount = data.amount ? `${data.amount} TON` : '';
  const reason = data.reason ?? 'не указана';
  const campaignTitle = data.campaignTitle ?? 'кампания';

  switch (type) {
    case 'DEAL_CREATED':
      return {
        text: `📩 Новая заявка на рекламу в <b>${channel}</b> на ${amount}`,
        buttonText: 'Открыть заявку',
      };
    case 'DEAL_APPROVED':
      return {
        text: `✅ Заявка на рекламу в <b>${channel}</b> одобрена! Средства (${amount}) заблокированы`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_REJECTED':
      return {
        text: `❌ Заявка на рекламу в <b>${channel}</b> отклонена. Причина: ${reason}`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_CANCELLED':
      return {
        text: `🚫 Рекламодатель отменил заявку на рекламу в <b>${channel}</b>`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_POSTED':
      return {
        text: `📢 Реклама размещена в <b>${channel}</b>!`,
        buttonText: 'Посмотреть',
      };
    case 'DEAL_AUTO_RELEASED':
      return {
        text: `💰 Сделка по <b>${channel}</b> завершена. Средства (${amount}) выплачены`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_DISPUTED':
      return {
        text: `⚠️ Открыт спор по сделке в <b>${channel}</b>. Причина: ${reason}`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_RESOLVED_RELEASE':
      return {
        text: `✅ Спор разрешён. Средства выплачены владельцу канала`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_RESOLVED_REFUND':
      return {
        text: `↩️ Спор разрешён. Средства возвращены рекламодателю`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_EXPIRED':
      return {
        text: `⏰ Заявка на рекламу в <b>${channel}</b> истекла`,
        buttonText: 'Подробнее',
      };
    case 'CHANNEL_APPROVED':
      return {
        text: `✅ Канал <b>${channel}</b> одобрен и доступен на маркетплейсе!`,
        buttonText: 'Открыть канал',
      };
    case 'CHANNEL_REJECTED':
      return {
        text: `❌ Канал <b>${channel}</b> отклонён. Причина: ${reason}`,
        buttonText: 'Подробнее',
      };
    case 'PLACEMENT_REQUESTED':
      return {
        text: `📩 Новая заявка на размещение в <b>${folder}</b>`,
        buttonText: 'Открыть заявку',
      };
    case 'PLACEMENT_APPROVED':
      return {
        text: `✅ Размещение в <b>${folder}</b> одобрено`,
        buttonText: 'Подробнее',
      };
    case 'PLACEMENT_REJECTED':
      return {
        text: `❌ Размещение в <b>${folder}</b> отклонено. Причина: ${reason}`,
        buttonText: 'Подробнее',
      };
    case 'APPEAL_FILED':
      return {
        text: `📋 Подана апелляция по сделке в <b>${channel}</b>`,
        buttonText: 'Подробнее',
      };
    case 'APPEAL_UPHELD':
      return {
        text: `⚖️ Апелляция по <b>${channel}</b> отклонена. Решение подтверждено`,
        buttonText: 'Подробнее',
      };
    case 'APPEAL_REVERSED':
      return {
        text: `🔄 Апелляция по <b>${channel}</b> удовлетворена. Решение отменено`,
        buttonText: 'Подробнее',
      };
    case 'APPEAL_WINDOW_OPENED':
      return {
        text: `⏳ Спор по <b>${channel}</b> разрешён. У вас 48ч на подачу апелляции`,
        buttonText: 'Подробнее',
      };
    case 'APPEAL_WINDOW_EXPIRED':
      return {
        text: `✅ Период апелляции по <b>${channel}</b> истёк. Средства доступны`,
        buttonText: 'Подробнее',
      };
    case 'CONTENT_SUBMITTED':
      return {
        text: `📝 Контент для рекламы в <b>${channel}</b> отправлен на проверку`,
        buttonText: 'Посмотреть',
      };
    case 'CONTENT_APPROVED':
      return {
        text: `✅ Контент для рекламы в <b>${channel}</b> одобрен`,
        buttonText: 'Подробнее',
      };
    case 'CONTENT_REJECTED':
      return {
        text: `❌ Контент для рекламы в <b>${channel}</b> отклонён. Причина: ${reason}`,
        buttonText: 'Подробнее',
      };
    case 'DEAL_MESSAGE':
      return {
        text: `💬 Новое сообщение по сделке в <b>${channel}</b>`,
        buttonText: 'Открыть',
      };
    case 'CAMPAIGN_STATUS_CHANGED':
      return {
        text: `📋 Статус кампании <b>${campaignTitle}</b> изменён на <b>${data.newStatus ?? ''}</b>`,
        buttonText: 'Подробнее',
      };
    case 'CAMPAIGN_BUDGET_LOW':
      return {
        text: `⚠️ Бюджет кампании <b>${campaignTitle}</b> заканчивается (осталось ${data.budgetPercentRemaining ?? 0}%)`,
        buttonText: 'Подробнее',
      };
    default:
      return { text: 'Новое уведомление', buttonText: 'Открыть' };
  }
}

@Processor(QUEUE_NAMES.NOTIFICATION)
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);
  private readonly rateLimiter = new RateLimiter(25);
  private botToken: string;
  private miniAppUrl: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {
    super();
    this.botToken = this.configService.get<string>('BOT_TOKEN', '');
    this.miniAppUrl = this.configService.get<string>('MINI_APP_URL', '');
  }

  async process(job: Job<NotificationJobData>): Promise<void> {
    const { type, recipientUserId, data } = job.data;

    if (!this.botToken) {
      this.logger.warn('BOT_TOKEN not configured, skipping notification');
      return;
    }

    // 1. Find user's telegramId
    const user = await this.prisma.user.findUnique({
      where: { id: recipientUserId },
      select: { telegramId: true },
    });

    if (!user?.telegramId) {
      this.logger.warn(`User ${recipientUserId} has no telegramId, skipping`);
      return;
    }

    // 2. Build message
    const template = buildMessage(type, data);
    const miniAppPath = data.miniAppPath || '';
    const webAppUrl = this.miniAppUrl ? `${this.miniAppUrl}${miniAppPath}` : '';

    // 3. Build inline keyboard with web_app button
    const inlineKeyboard = webAppUrl
      ? {
          inline_keyboard: [
            [
              {
                text: template.buttonText,
                web_app: { url: webAppUrl },
              },
            ],
          ],
        }
      : undefined;

    // 4. Rate limit
    await this.rateLimiter.acquire();

    // 5. Send via Telegram Bot API
    // telegramId is BigInt in Prisma — convert to string for JSON serialization
    const chatId = user.telegramId.toString();

    const response = await fetch(
      `https://api.telegram.org/bot${this.botToken}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: template.text,
          parse_mode: 'HTML',
          ...(inlineKeyboard && { reply_markup: inlineKeyboard }),
        }),
      },
    );

    const result = await response.json() as { ok: boolean; error_code?: number; description?: string };

    if (!result.ok) {
      // 403 = bot blocked by user — don't retry
      if (result.error_code === 403) {
        this.logger.warn(
          `User ${recipientUserId} blocked the bot (telegramId: ${user.telegramId})`,
        );
        throw new UnrecoverableError('Bot blocked by user');
      }
      throw new Error(`Telegram API error ${result.error_code}: ${result.description}`);
    }

    this.logger.log(`Sent ${type} notification to user ${recipientUserId} (telegramId: ${chatId})`);
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job, error: Error) {
    this.logger.error(
      `Notification job ${job.id} failed (type: ${job.data?.type}): ${error.message}`,
    );
  }
}
