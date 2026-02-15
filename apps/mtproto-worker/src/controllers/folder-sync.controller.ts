import { Controller, Post, Param, Get, Logger } from '@nestjs/common';
import { FolderSyncService } from '../services/folder-sync.service';

@Controller('internal/folders')
export class FolderSyncController {
  private readonly logger = new Logger(FolderSyncController.name);

  constructor(private folderSyncService: FolderSyncService) {}

  @Post(':id/sync')
  async syncFolder(@Param('id') folderId: string) {
    this.logger.log(`Sync requested for folder ${folderId}`);
    return this.folderSyncService.syncFolder(folderId);
  }

  @Get(':id/channels')
  async getSyncedChannels(@Param('id') folderId: string) {
    const result = await this.folderSyncService.getSyncedChannels(folderId);
    if (!result) {
      return { success: false, error: 'Folder not found' };
    }
    return {
      success: true,
      ...result,
    };
  }
}
