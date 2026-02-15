import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { validateTelegramWebAppData } from '@tam/security';
import { Request } from 'express';
import { PrismaService } from '../../../common/prisma/prisma.service';

@Injectable()
export class TelegramAuthGuard implements CanActivate {
  constructor(
    private configService: ConfigService,
    private prisma: PrismaService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const initData = request.headers['x-telegram-init-data'] as string;

    if (!initData) {
      throw new UnauthorizedException('Missing Telegram authentication');
    }

    const botToken = this.configService.get<string>('BOT_TOKEN');
    if (!botToken) {
      throw new Error('BOT_TOKEN not configured');
    }

    const validation = validateTelegramWebAppData(initData, botToken);

    if (!validation.valid || !validation.data?.user) {
      throw new UnauthorizedException('Invalid Telegram authentication');
    }

    const telegramUser = validation.data.user;

    // Find the user
    const user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Attach user to request
    (request as Request & { user: unknown }).user = {
      id: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };

    return true;
  }
}
