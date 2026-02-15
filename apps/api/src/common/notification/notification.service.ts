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
};

function buildMessageText(type: NotificationType, data: NotificationJobData['data']): string {
  const channel = data.channelTitle ?? 'канал';
  const folder = data.folderTitle ?? 'папка';
  const amount = data.amount ? `${data.amount} TON` : '';
  const reason = data.reason ?? '';

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
