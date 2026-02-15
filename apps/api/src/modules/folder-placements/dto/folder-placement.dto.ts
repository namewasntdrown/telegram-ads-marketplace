import { IsString, IsOptional, IsEnum } from 'class-validator';
import { FolderPlacementStatus } from '@tam/shared-types';

export class CreateFolderPlacementDto {
  @IsString()
  channelId: string;
}

export class ApprovePlacementDto {
  // Empty DTO - только действие требуется
}

export class RejectPlacementDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export interface FolderPlacementFiltersDto {
  status?: FolderPlacementStatus;
  folderId?: string;
  channelId?: string;
  page?: number;
  limit?: number;
}

export interface FolderPlacementResponseDto {
  id: string;
  folderId: string;
  channelId: string;
  channelOwnerId: string;
  folderOwnerId: string;
  amount: string;
  platformFee: string;
  status: FolderPlacementStatus;
  rejectionReason?: string;
  createdAt: Date;
  updatedAt: Date;
  approvedAt?: Date;
  escrowReleaseAt?: Date;  // Когда средства будут выплачены владельцу папки
  completedAt?: Date;      // Когда средства были фактически выплачены
  // Relations
  folder?: {
    id: string;
    title: string;
    folderLink: string;
    pricePerChannel?: string;
  };
  channel?: {
    id: string;
    title: string;
    username?: string;
    avatarUrl?: string;
    subscriberCount: number;
  };
  channelOwner?: {
    id: string;
    username?: string;
    firstName?: string;
  };
  folderOwner?: {
    id: string;
    username?: string;
    firstName?: string;
  };
}

export interface PaginatedPlacementsDto {
  items: FolderPlacementResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
