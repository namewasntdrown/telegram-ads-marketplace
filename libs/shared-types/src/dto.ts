import {
  ContentType,
  DisputeReason,
  ChannelStatus,
  CampaignStatus,
  FolderPlacementStatus,
} from './enums.js';

// Auth DTOs
export interface TelegramInitData {
  query_id?: string;
  user?: {
    id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    language_code?: string;
    is_premium?: boolean;
  };
  auth_date: number;
  hash: string;
}

export interface AuthResponseDto {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: UserResponseDto;
}

export interface RefreshTokenDto {
  refreshToken: string;
}

// User DTOs
export interface UserResponseDto {
  id: string;
  telegramId: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  role: string;
  balanceTon: string;
  frozenTon: string;
}

export interface UpdateUserDto {
  walletAddress?: string;
}

// Channel DTOs
export interface CreateChannelDto {
  telegramId: string;
  username?: string;
  pricePerPost: string;
  categories: string[];
}

export interface UpdateChannelDto {
  pricePerPost?: string;
  categories?: string[];
  description?: string;
}

export interface ChannelResponseDto {
  id: string;
  telegramId: string;
  username?: string;
  title: string;
  description?: string;
  subscriberCount: number;
  avgViews: number;
  pricePerPost: string;
  categories: string[];
  language: string;
  status: ChannelStatus;
  ownerId: string;
}

export interface ChannelFiltersDto {
  categories?: string[];
  minSubscribers?: number;
  maxSubscribers?: number;
  minPrice?: string;
  maxPrice?: string;
  language?: string;
  status?: ChannelStatus;
  page?: number;
  limit?: number;
}

// Campaign DTOs
export interface CreateCampaignDto {
  title: string;
  description?: string;
  totalBudget: string;
  categories: string[];
  targetLanguages: string[];
}

export interface UpdateCampaignDto {
  title?: string;
  description?: string;
  totalBudget?: string;
  categories?: string[];
  targetLanguages?: string[];
  status?: CampaignStatus;
}

export interface CampaignResponseDto {
  id: string;
  title: string;
  description?: string;
  totalBudget: string;
  spentBudget: string;
  categories: string[];
  targetLanguages: string[];
  status: CampaignStatus;
  advertiserId: string;
  dealsCount: number;
}

// Deal DTOs
export interface CreateDealDto {
  campaignId: string;
  channelId: string;
  amount: string;
  contentType: ContentType;
  contentText?: string;
  contentMediaUrls?: string[];
  scheduledPostTime?: string;
  minViewsRequired?: number;
}

export interface UpdateDealContentDto {
  contentText?: string;
  contentMediaUrls?: string[];
}

export interface SubmitContentDto {
  contentText?: string;
  contentMediaUrls?: string[];
}

export interface ApproveDealDto {
  approved: boolean;
  rejectionReason?: string;
}

export interface DisputeDealDto {
  reason: DisputeReason;
  description: string;
}

export interface DealResponseDto {
  id: string;
  amount: string;
  platformFee: string;
  status: string;
  contentType: ContentType;
  contentText?: string;
  contentMediaUrls: string[];
  postUrl?: string;
  scheduledPostTime?: string;
  actualPostTime?: string;
  minViewsRequired?: number;
  viewsAtVerification?: number;
  verificationDeadline?: string;
  campaign: CampaignResponseDto;
  channel: ChannelResponseDto;
  advertiserId: string;
  channelOwnerId: string;
}

// Escrow DTOs
export interface DepositRequestDto {
  amount: string;
}

export interface DepositResponseDto {
  address: string;
  memo: string;
  amount: string;
  expiresAt: string;
}

export interface WithdrawRequestDto {
  amount: string;
  toAddress: string;
}

export interface WithdrawResponseDto {
  transactionId: string;
  status: string;
  estimatedTime: string;
}

// Transaction DTOs
export interface TransactionResponseDto {
  id: string;
  tonTxHash?: string;
  amount: string;
  type: string;
  status: string;
  createdAt: string;
}

// Pagination
export interface PaginatedResponseDto<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Admin DTOs
export interface AdminUpdateChannelStatusDto {
  status: ChannelStatus;
  reason?: string;
}

export interface AdminResolveDIsputeDto {
  resolution: 'RELEASE' | 'REFUND' | 'PARTIAL';
  releaseAmount?: string;
  refundAmount?: string;
  notes: string;
}

// Folder Placement DTOs
export interface CreateFolderPlacementDto {
  channelId: string;
}

export interface ApprovePlacementDto {
  // Empty DTO, only action is needed
}

export interface RejectPlacementDto {
  reason?: string;
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
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  escrowReleaseAt?: string;  // Когда средства будут выплачены (approvedAt + 3 дня)
  completedAt?: string;      // Когда средства были фактически выплачены
  // Relations
  folder?: {
    id: string;
    title: string;
    folderLink: string;
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

export interface PaginatedFolderPlacementsDto {
  items: FolderPlacementResponseDto[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
