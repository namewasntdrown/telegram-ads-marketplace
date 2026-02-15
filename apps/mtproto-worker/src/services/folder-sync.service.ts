import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { TelegramClientService } from './telegram-client.service';

@Injectable()
export class FolderSyncService {
  private readonly logger = new Logger(FolderSyncService.name);

  constructor(
    private prisma: PrismaService,
    private telegramClient: TelegramClientService,
  ) {}

  /**
   * Sync folder channels from Telegram
   */
  async syncFolder(folderId: string): Promise<{
    success: boolean;
    channelsCount?: number;
    channels?: Array<{
      telegramId: string;
      title: string;
      username?: string;
      subscriberCount: number;
    }>;
    error?: string;
  }> {
    try {
      const folder = await this.prisma.folder.findUnique({
        where: { id: folderId },
      });

      if (!folder) {
        return { success: false, error: 'Folder not found' };
      }

      if (!folder.folderHash) {
        return { success: false, error: 'Folder hash not available' };
      }

      if (!this.telegramClient.isInitialized()) {
        return { success: false, error: 'Telegram client not initialized' };
      }

      this.logger.log(`Syncing folder ${folderId} (hash: ${folder.folderHash})`);

      const result = await this.telegramClient.getFolderChannels(folder.folderHash);

      if (!result) {
        return { success: false, error: 'Failed to get folder channels from Telegram' };
      }

      // Map channels to our format
      const channels = result.channels.map((ch) => ({
        telegramId: ch.id,
        title: ch.title,
        username: ch.username,
        subscriberCount: ch.subscriberCount,
      }));

      // Update database
      await this.prisma.folder.update({
        where: { id: folderId },
        data: {
          syncedChannels: channels,
          lastSyncedAt: new Date(),
        },
      });

      this.logger.log(`Synced ${channels.length} channels for folder ${folderId}`);

      return {
        success: true,
        channelsCount: channels.length,
        channels,
      };
    } catch (error: any) {
      this.logger.error(`Sync failed for folder ${folderId}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get synced channels for a folder
   */
  async getSyncedChannels(folderId: string): Promise<{
    channels: Array<{
      telegramId: string;
      title: string;
      username?: string;
      subscriberCount: number;
    }>;
    lastSyncedAt: Date | null;
  } | null> {
    const folder = await this.prisma.folder.findUnique({
      where: { id: folderId },
      select: {
        syncedChannels: true,
        lastSyncedAt: true,
      },
    });

    if (!folder) {
      return null;
    }

    return {
      channels: (folder.syncedChannels as any[]) || [],
      lastSyncedAt: folder.lastSyncedAt,
    };
  }
}
