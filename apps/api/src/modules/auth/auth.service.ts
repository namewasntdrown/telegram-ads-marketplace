import {
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  validateTelegramWebAppData,
  validateTelegramLoginWidget,
  generateSecureToken,
  hashToken,
} from '@tam/security';
import type { TelegramLoginWidgetData } from '@tam/security';
import { AuthResponseDto, UserResponseDto } from './dto/auth.dto';

interface TelegramPhoto {
  file_id: string;
  file_unique_id: string;
  width: number;
  height: number;
  file_size?: number;
}

interface TelegramUserPhotosResponse {
  ok: boolean;
  result?: {
    total_count: number;
    photos: TelegramPhoto[][];
  };
}

interface TelegramFileResponse {
  ok: boolean;
  result?: {
    file_id: string;
    file_unique_id: string;
    file_size?: number;
    file_path?: string;
  };
}

interface JwtPayload {
  sub: string;
  telegramId: string;
  role: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
    private configService: ConfigService
  ) {}

  async authenticateWithTelegram(initData: string): Promise<AuthResponseDto> {
    const botToken = this.configService.get<string>('BOT_TOKEN');

    if (!botToken) {
      throw new Error('BOT_TOKEN not configured');
    }

    const validation = validateTelegramWebAppData(initData, botToken);

    if (!validation.valid || !validation.data?.user) {
      this.logger.warn(`Invalid Telegram auth: ${validation.error}`);
      throw new UnauthorizedException('Invalid Telegram authentication');
    }

    const telegramUser = validation.data.user;

    // Get user photo from Telegram API
    const photoUrl = telegramUser.photo_url || await this.getUserPhotoUrl(telegramUser.id, botToken);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: photoUrl,
        },
      });
      this.logger.log(`New user created: ${user.id}`);
    } else {
      // Update user info if changed
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: photoUrl || user.photoUrl, // Keep existing if new one not available
        },
      });
    }

    return this.generateTokens(user);
  }

  async authenticateWithLoginWidget(widgetData: TelegramLoginWidgetData): Promise<AuthResponseDto> {
    const botToken = this.configService.get<string>('BOT_TOKEN');

    if (!botToken) {
      throw new Error('BOT_TOKEN not configured');
    }

    const validation = validateTelegramLoginWidget(widgetData, botToken);

    if (!validation.valid || !validation.data) {
      this.logger.warn(`Invalid Login Widget auth: ${validation.error}`);
      throw new UnauthorizedException('Invalid Telegram authentication');
    }

    const telegramUser = validation.data;

    // Use photo_url from widget or fetch from Telegram API
    const photoUrl = telegramUser.photo_url || await this.getUserPhotoUrl(telegramUser.id, botToken);

    // Find or create user
    let user = await this.prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
    });

    if (!user) {
      user = await this.prisma.user.create({
        data: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: photoUrl,
        },
      });
      this.logger.log(`New user created via Login Widget: ${user.id}`);
    } else {
      user = await this.prisma.user.update({
        where: { id: user.id },
        data: {
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
          photoUrl: photoUrl || user.photoUrl,
        },
      });
    }

    return this.generateTokens(user);
  }

  async refreshToken(refreshToken: string): Promise<AuthResponseDto> {
    // Hash the incoming token to search by it (hash is unique)
    const hashedToken = hashToken(refreshToken);

    // Find the exact refresh token by its hash
    // This is secure because:
    // 1. Hash lookup is unique - only one token will match
    // 2. We verify expiry and revocation status
    // 3. User is retrieved from the database relationship, not from client input
    const storedToken = await this.prisma.refreshToken.findFirst({
      where: {
        token: hashedToken, // Search by hash directly (unique identifier)
        expiresAt: { gt: new Date() },
        revokedAt: null,
      },
      include: { user: true },
    });

    if (!storedToken) {
      this.logger.warn('Invalid or expired refresh token attempt');
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Revoke the old token (rotation)
    await this.prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    return this.generateTokens(storedToken.user);
  }

  async logout(userId: string): Promise<void> {
    // Revoke all refresh tokens for this user
    await this.prisma.refreshToken.updateMany({
      where: {
        userId,
        revokedAt: null,
      },
      data: { revokedAt: new Date() },
    });
  }

  async validateUser(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      id: user.id,
      telegramId: user.telegramId,
      role: user.role,
    };
  }

  private async getUserPhotoUrl(telegramId: number, botToken: string): Promise<string | null> {
    try {
      // Get user profile photos
      const photosResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getUserProfilePhotos?user_id=${telegramId}&limit=1`
      );
      const photosData = (await photosResponse.json()) as TelegramUserPhotosResponse;

      if (!photosData.ok || !photosData.result?.photos?.length) {
        return null;
      }

      // Get the first photo set
      const photoSet = photosData.result.photos[0];
      if (!photoSet || !photoSet.length) {
        return null;
      }

      // Use medium size photo (index 1 or 0 if only one)
      const photo = photoSet[Math.min(1, photoSet.length - 1)];
      if (!photo) {
        return null;
      }

      // Get file path
      const fileResponse = await fetch(
        `https://api.telegram.org/bot${botToken}/getFile?file_id=${photo.file_id}`
      );
      const fileData = (await fileResponse.json()) as TelegramFileResponse;

      if (!fileData.ok || !fileData.result?.file_path) {
        return null;
      }

      return `https://api.telegram.org/file/bot${botToken}/${fileData.result.file_path}`;
    } catch (error) {
      this.logger.warn(`Failed to get user photo: ${error}`);
      return null;
    }
  }

  private async generateTokens(user: {
    id: string;
    telegramId: bigint;
    role: string;
    username: string | null;
    firstName: string | null;
    lastName: string | null;
    photoUrl: string | null;
    walletAddress: string | null;
    balanceTon: { toString: () => string };
    frozenTon: { toString: () => string };
    createdAt: Date;
  }): Promise<AuthResponseDto> {
    const payload: JwtPayload = {
      sub: user.id,
      telegramId: user.telegramId.toString(),
      role: user.role,
    };

    const accessToken = this.jwtService.sign(payload);

    // Generate refresh token
    const refreshTokenValue = generateSecureToken(32);
    const hashedToken = hashToken(refreshTokenValue);

    // Store refresh token with 7 day expiry
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    await this.prisma.refreshToken.create({
      data: {
        token: hashedToken,
        userId: user.id,
        expiresAt,
      },
    });

    // Clean up old refresh tokens
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId: user.id,
        OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }],
      },
    });

    const userResponse: UserResponseDto = {
      id: user.id,
      telegramId: user.telegramId.toString(),
      username: user.username ?? undefined,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
      photoUrl: user.photoUrl ?? undefined,
      walletAddress: user.walletAddress ?? undefined,
      role: user.role,
      balanceTon: user.balanceTon.toString(),
      frozenTon: user.frozenTon.toString(),
      createdAt: user.createdAt.toISOString(),
    };

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      expiresIn: 900, // 15 minutes in seconds
      user: userResponse,
    };
  }
}
