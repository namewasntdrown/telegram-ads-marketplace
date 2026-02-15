import {
  UserRole,
  ChannelStatus,
  CampaignStatus,
  DealStatus,
  TransactionType,
  TransactionStatus,
  ContentType,
  DisputeReason,
  FolderStatus,
  FolderPlacementStatus,
} from './enums.js';

export interface IUser {
  id: string;
  telegramId: bigint;
  username?: string;
  firstName?: string;
  lastName?: string;
  walletAddress?: string;
  role: UserRole;
  balanceTon: string;
  frozenTon: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IChannel {
  id: string;
  telegramId: bigint;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface ICampaign {
  id: string;
  title: string;
  description?: string;
  totalBudget: string;
  spentBudget: string;
  categories: string[];
  targetLanguages: string[];
  status: CampaignStatus;
  advertiserId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDeal {
  id: string;
  amount: string;
  platformFee: string;
  status: DealStatus;
  contentType: ContentType;
  contentText?: string;
  contentMediaUrls: string[];
  postUrl?: string;
  postMessageId?: number;
  scheduledPostTime?: Date;
  actualPostTime?: Date;
  minViewsRequired?: number;
  viewsAtVerification?: number;
  verificationDeadline?: Date;
  disputeReason?: DisputeReason;
  disputeDescription?: string;
  campaignId: string;
  channelId: string;
  advertiserId: string;
  channelOwnerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ITransaction {
  id: string;
  tonTxHash?: string;
  amount: string;
  type: TransactionType;
  status: TransactionStatus;
  userId: string;
  dealId?: string;
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface IDepositAddress {
  id: string;
  address: string;
  memo?: string;
  isActive: boolean;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
}

export interface IAuditLog {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  userId?: string;
  oldValue?: Record<string, unknown>;
  newValue?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
}

export interface IChannelStats {
  channelId: string;
  date: Date;
  subscriberCount: number;
  avgViews: number;
  postsCount: number;
  engagement: number;
}

export interface IFolder {
  id: string;
  title: string;
  description?: string;
  folderLink: string;
  folderHash?: string;
  categories: string[];
  status: FolderStatus;
  boostAmount: string;
  boostUntil?: Date;
  pricePerChannel?: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IFolderPlacement {
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
  escrowReleaseAt?: Date;
  completedAt?: Date;
}
