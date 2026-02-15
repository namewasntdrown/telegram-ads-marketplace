import { Module } from '@nestjs/common';
import { FolderPlacementsController } from './folder-placements.controller';
import { FolderPlacementsService } from './folder-placements.service';
import { PrismaModule } from '../../common/prisma/prisma.module';
import { EscrowModule } from '../escrow/escrow.module';
import { NotificationModule } from '../../common/notification/notification.module';

@Module({
  imports: [PrismaModule, EscrowModule, NotificationModule],
  controllers: [FolderPlacementsController],
  providers: [FolderPlacementsService],
  exports: [FolderPlacementsService],
})
export class FolderPlacementsModule {}
