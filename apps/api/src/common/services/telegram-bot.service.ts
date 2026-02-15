import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
  username?: string;
  description?: string;
  photo?: {
    small_file_id: string;
    big_file_id: string;
  };
}

interface TelegramResponse<T> {
  ok: boolean;
  result?: T;
  description?: string;
}

@Injectable()
export class TelegramBotService {
  private readonly logger = new Logger(TelegramBotService.name);
  private readonly botToken: string;
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.botToken = this.configService.get<string>('BOT_TOKEN') ?? '';
    this.baseUrl = `https://api.telegram.org/bot${this.botToken}`;
  }

  async getChat(chatId: string | number): Promise<TelegramChat | null> {
    try {
      const response = await fetch(`${this.baseUrl}/getChat?chat_id=${chatId}`);
      const data = (await response.json()) as TelegramResponse<TelegramChat>;

      if (!data.ok || !data.result) {
        this.logger.warn(`Failed to get chat ${chatId}: ${data.description}`);
        return null;
      }

      return data.result;
    } catch (error) {
      this.logger.error(`Error getting chat ${chatId}: ${error}`);
      return null;
    }
  }

  async getChatMemberCount(chatId: string | number): Promise<number> {
    try {
      const response = await fetch(
        `${this.baseUrl}/getChatMemberCount?chat_id=${chatId}`
      );
      const data = (await response.json()) as TelegramResponse<number>;

      if (!data.ok || data.result === undefined) {
        this.logger.warn(`Failed to get member count for ${chatId}: ${data.description}`);
        return 0;
      }

      return data.result;
    } catch (error) {
      this.logger.error(`Error getting member count for ${chatId}: ${error}`);
      return 0;
    }
  }

  async getChannelPhotoUrl(chatId: string | number): Promise<string | null> {
    try {
      const chat = await this.getChat(chatId);
      if (!chat?.photo?.big_file_id) {
        return null;
      }

      // Get file path
      const fileResponse = await fetch(
        `${this.baseUrl}/getFile?file_id=${chat.photo.big_file_id}`
      );
      const fileData = (await fileResponse.json()) as TelegramResponse<{
        file_path?: string;
      }>;

      if (!fileData.ok || !fileData.result?.file_path) {
        return null;
      }

      return `https://api.telegram.org/file/bot${this.botToken}/${fileData.result.file_path}`;
    } catch (error) {
      this.logger.error(`Error getting channel photo: ${error}`);
      return null;
    }
  }

  async getFullChannelInfo(chatId: string | number): Promise<{
    title: string;
    username?: string;
    description?: string;
    subscriberCount: number;
    avatarUrl?: string;
  } | null> {
    try {
      const [chat, memberCount, avatarUrl] = await Promise.all([
        this.getChat(chatId),
        this.getChatMemberCount(chatId),
        this.getChannelPhotoUrl(chatId),
      ]);

      if (!chat) {
        return null;
      }

      return {
        title: chat.title ?? 'Unknown',
        username: chat.username,
        description: chat.description,
        subscriberCount: memberCount,
        avatarUrl: avatarUrl ?? undefined,
      };
    } catch (error) {
      this.logger.error(`Error getting full channel info: ${error}`);
      return null;
    }
  }

  async downloadChannelPhoto(chatId: string | number): Promise<Buffer | null> {
    try {
      const chat = await this.getChat(chatId);
      if (!chat?.photo?.big_file_id) {
        return null;
      }

      // Get file path
      const fileResponse = await fetch(
        `${this.baseUrl}/getFile?file_id=${chat.photo.big_file_id}`
      );
      const fileData = (await fileResponse.json()) as TelegramResponse<{
        file_path?: string;
      }>;

      if (!fileData.ok || !fileData.result?.file_path) {
        return null;
      }

      const fileUrl = `https://api.telegram.org/file/bot${this.botToken}/${fileData.result.file_path}`;

      // Download the file
      const downloadResponse = await fetch(fileUrl);
      if (!downloadResponse.ok) {
        this.logger.warn(`Failed to download photo: ${downloadResponse.status}`);
        return null;
      }

      const arrayBuffer = await downloadResponse.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      this.logger.error(`Error downloading channel photo: ${error}`);
      return null;
    }
  }
}
