import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { NotificationService } from '../../common/notification/notification.service';
import { ChannelAdminsService } from '../channels/channel-admins.service';
import { DealStateMachine } from './state-machine/deal-state.machine';
import { DealStatus } from '@tam/shared-types';
import { sanitizeHtml } from '@tam/security';
import { SendMessageDto, DealMessageResponseDto } from './dto/deal.dto';

@Injectable()
export class DealMessagesService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    private channelAdminsService: ChannelAdminsService,
    private stateMachine: DealStateMachine,
  ) {}

  async getMessages(
    dealId: string,
    userId: string,
    page: number,
    limit: number,
  ): Promise<{ items: DealMessageResponseDto[]; total: number }> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Verify user is party to deal
    await this.verifyDealAccess(deal, userId);

    const skip = (page - 1) * limit;

    const [messages, total] = await Promise.all([
      this.prisma.dealMessage.findMany({
        where: { dealId },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
        include: {
          sender: { select: { username: true, firstName: true } },
        },
      }),
      this.prisma.dealMessage.count({ where: { dealId } }),
    ]);

    return {
      items: messages.map((m) => ({
        id: m.id,
        dealId: m.dealId,
        senderId: m.senderId,
        senderName: m.sender.username || m.sender.firstName || undefined,
        text: m.text,
        createdAt: m.createdAt.toISOString(),
      })),
      total,
    };
  }

  async sendMessage(
    dealId: string,
    userId: string,
    dto: SendMessageDto,
  ): Promise<DealMessageResponseDto> {
    const deal = await this.prisma.deal.findUnique({
      where: { id: dealId },
    });

    if (!deal) {
      throw new NotFoundException('Deal not found');
    }

    // Verify user is party to deal
    await this.verifyDealAccess(deal, userId);

    // Don't allow messages on terminal deals
    if (this.stateMachine.isTerminalStatus(deal.status as DealStatus)) {
      throw new BadRequestException('Cannot send messages on completed deals');
    }

    const sanitizedText = sanitizeHtml(dto.text);

    const message = await this.prisma.dealMessage.create({
      data: {
        dealId,
        senderId: userId,
        text: sanitizedText,
      },
      include: {
        sender: { select: { username: true, firstName: true } },
      },
    });

    // Notify the other party
    const recipientId = deal.advertiserId === userId
      ? deal.channelOwnerId
      : deal.advertiserId;

    const channel = await this.prisma.channel.findUnique({
      where: { id: deal.channelId },
      select: { title: true },
    });

    this.notificationService.send('DEAL_MESSAGE', recipientId, {
      dealId,
      channelId: deal.channelId,
      channelTitle: channel?.title,
      miniAppPath: `/deals/${dealId}`,
    });

    return {
      id: message.id,
      dealId: message.dealId,
      senderId: message.senderId,
      senderName: message.sender.username || message.sender.firstName || undefined,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
    };
  }

  private async verifyDealAccess(deal: any, userId: string): Promise<void> {
    if (deal.advertiserId === userId || deal.channelOwnerId === userId) {
      return;
    }

    const isAdmin = await this.channelAdminsService.isChannelAdmin(deal.channelId, userId);
    if (!isAdmin) {
      throw new ForbiddenException('Not authorized to access this deal');
    }
  }
}
