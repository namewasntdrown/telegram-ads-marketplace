import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  QUEUE_NAMES,
  NotificationType,
  NotificationJobData,
  NOTIFICATION_JOB_OPTIONS,
} from '@tam/queue-contracts';
import { PrismaService } from '../prisma/prisma.service';

const NOTIFICATION_TITLES: Record<NotificationType, string> = {
  DEAL_CREATED: 'Новая заявка',
  DEAL_APPROVED: 'Заявка одобрена',
  DEAL_REJECTED: 'Заявка отклонена',
  DEAL_CANCELLED: 'Заявка отменена',
  DEAL_POSTED: 'Реклама размещена',
  DEAL_AUTO_RELEASED: 'Средства выплачены',
  DEAL_DISPUTED: 'Открыт спор',
  DEAL_RESOLVED_RELEASE: 'Спор разрешён',
  DEAL_RESOLVED_REFUND: 'Спор разрешён',
  DEAL_EXPIRED: 'Заявка истекла',
  CHANNEL_APPROVED: 'Канал одобрен',
  CHANNEL_REJECTED: 'Канал отклонён',
  PLACEMENT_REQUESTED: 'Новая заявка на размещение',
  PLACEMENT_APPROVED: 'Размещение одобрено',
  PLACEMENT_REJECTED: 'Размещение отклонено',
  APPEAL_FILED: 'Подана апелляция',
  APPEAL_UPHELD: 'Апелляция отклонена',
  APPEAL_REVERSED: 'Апелляция удовлетворена',
  APPEAL_WINDOW_OPENED: 'Окно апелляции открыто',
  APPEAL_WINDOW_EXPIRED: 'Период апелляции истёк',
  CONTENT_SUBMITTED: 'Контент отправлен',
  CONTENT_APPROVED: 'Контент одобрен',
  CONTENT_REJECTED: 'Контент отклонён',
  DEAL_MESSAGE: 'Новое сообщение',
  CAMPAIGN_STATUS_CHANGED: 'Статус кампании изменён',
  CAMPAIGN_BUDGET_LOW: 'Бюджет кампании заканчивается',
};

function buildMessageText(type: NotificationType, data: NotificationJobData['data']): string {
  const channel = data.channelTitle ?? 'канал';
  const folder = data.folderTitle ?? 'папка';
  const amount = data.amount ? `${data.amount} TON` : '';
  const reason = data.reason ?? '';
  const campaignTitle = data.campaignTitle ?? 'кампания';

  switch (type) {
    case 'DEAL_CREATED': return `Новая заявка на рекламу в ${channel} на ${amount}`;
    case 'DEAL_APPROVED': return `Заявка на рекламу в ${channel} одобрена. Средства (${amount}) заблокированы`;
    case 'DEAL_REJECTED': return `Заявка на рекламу в ${channel} отклонена${reason ? `. Причина: ${reason}` : ''}`;
    case 'DEAL_CANCELLED': return `Рекламодатель отменил заявку на рекламу в ${channel}`;
    case 'DEAL_POSTED': return `Реклама размещена в ${channel}`;
    case 'DEAL_AUTO_RELEASED': return `Сделка по ${channel} завершена. Средства (${amount}) выплачены`;
    case 'DEAL_DISPUTED': return `Открыт спор по сделке в ${channel}${reason ? `. Причина: ${reason}` : ''}`;
    case 'DEAL_RESOLVED_RELEASE': return `Спор разрешён. Средства выплачены владельцу канала`;
    case 'DEAL_RESOLVED_REFUND': return `Спор разрешён. Средства возвращены рекламодателю`;
    case 'DEAL_EXPIRED': return `Заявка на рекламу в ${channel} истекла`;
    case 'CHANNEL_APPROVED': return `Канал ${channel} одобрен и доступен на маркетплейсе`;
    case 'CHANNEL_REJECTED': return `Канал ${channel} отклонён${reason ? `. Причина: ${reason}` : ''}`;
    case 'PLACEMENT_REQUESTED': return `Новая заявка на размещение в ${folder}`;
    case 'PLACEMENT_APPROVED': return `Размещение в ${folder} одобрено`;
    case 'PLACEMENT_REJECTED': return `Размещение в ${folder} отклонено${reason ? `. Причина: ${reason}` : ''}`;
    case 'APPEAL_FILED': return `Подана апелляция по сделке в ${channel}`;
    case 'APPEAL_UPHELD': return `Апелляция по ${channel} отклонена. Решение подтверждено`;
    case 'APPEAL_REVERSED': return `Апелляция по ${channel} удовлетворена. Решение отменено`;
    case 'APPEAL_WINDOW_OPENED': return `Спор по ${channel} разрешён. 48ч на подачу апелляции`;
    case 'APPEAL_WINDOW_EXPIRED': return `Период апелляции по ${channel} истёк. Средства доступны`;
    case 'CONTENT_SUBMITTED': return `Контент для рекламы в ${channel} отправлен на проверку`;
    case 'CONTENT_APPROVED': return `Контент для рекламы в ${channel} одобрен`;
    case 'CONTENT_REJECTED': return `Контент для рекламы в ${channel} отклонён${reason ? `. Причина: ${reason}` : ''}`;
    case 'DEAL_MESSAGE': return `Новое сообщение по сделке в ${channel}`;
    case 'CAMPAIGN_STATUS_CHANGED': return `Статус кампании «${campaignTitle}» изменён на ${data.newStatus ?? ''}`;
    case 'CAMPAIGN_BUDGET_LOW': return `Бюджет кампании «${campaignTitle}» заканчивается (осталось ${data.budgetPercentRemaining ?? 0}%)`;
    default: return 'Новое уведомление';
  }
}

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue<NotificationJobData>,
    private prisma: PrismaService,
  ) {}

  /**
   * Fire-and-forget notification to a single recipient.
   * Saves to DB for in-app display + queues for Telegram delivery.
   * Errors are logged but never block the caller.
   */
  send(
    type: NotificationType,
    recipientUserId: string,
    data: NotificationJobData['data'],
  ): void {
    const title = NOTIFICATION_TITLES[type] ?? 'Уведомление';
    const message = buildMessageText(type, data);

    // Save to DB for in-app display
    this.prisma.notification.create({
      data: {
        type,
        userId: recipientUserId,
        title,
        message,
        data: data as any,
      },
    }).catch((error) => {
      this.logger.error(`Failed to save ${type} notification to DB: ${error.message}`);
    });

    // Queue for Telegram delivery
    this.notificationQueue
      .add(type, { type, recipientUserId, data }, NOTIFICATION_JOB_OPTIONS)
      .then(() => {
        this.logger.debug(`Queued ${type} notification for user ${recipientUserId}`);
      })
      .catch((error) => {
        this.logger.error(`Failed to queue ${type} notification: ${error.message}`);
      });
  }

  /**
   * Send the same notification to multiple recipients.
   */
  sendToMany(
    type: NotificationType,
    userIds: string[],
    data: NotificationJobData['data'],
  ): void {
    for (const userId of userIds) {
      this.send(type, userId, data);
    }
  }
}
