// Queue names
export const QUEUE_NAMES = {
  DEPOSIT_WATCHER: 'deposit-watcher',
  WITHDRAWAL_PROCESSOR: 'withdrawal-processor',
  SCHEDULER: 'scheduler',
  CHANNEL_STATS: 'channel-stats',
  POST_VERIFICATION: 'post-verification',
  AUTOPOST: 'autopost',
  FOLDER_SYNC: 'folder-sync',
  NOTIFICATION: 'notification',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

// Job types for deposit watcher
export interface DepositWatcherJobData {
  depositAddressId: string;
  userId: string;
  memo: string;
  expectedAmount: string;
  createdAt: number;
  expiresAt: number;
}

export interface DepositConfirmedJobData {
  depositAddressId: string;
  userId: string;
  amount: string;
  txHash: string;
  memo: string;
}

// Job types for withdrawal processor
export interface WithdrawalJobData {
  transactionId: string;
  userId: string;
  toAddress: string;
  amount: string;
}

export interface WithdrawalCompletedJobData {
  transactionId: string;
  txHash: string;
  success: boolean;
  error?: string;
}

// Job types for scheduler
export interface SchedulerJobData {
  type: 'CHECK_EXPIRED_DEALS' | 'CHECK_VERIFICATION_DEADLINES' | 'UPDATE_CHANNEL_STATS' | 'CHECK_SCHEDULED_POSTS' | 'CHECK_APPEAL_DEADLINES';
}

export interface DealExpiryCheckJobData {
  dealId: string;
  currentStatus: string;
  deadline: number;
}

// Job types for channel stats
export interface ChannelStatsJobData {
  channelId: string;
  telegramChannelId: string;
}

export interface ChannelStatsUpdateJobData {
  channelId: string;
  subscriberCount: number;
  avgViews: number;
  postsCount: number;
}

// Job types for post verification
export interface PostVerificationJobData {
  dealId: string;
  channelId: string;
  telegramChannelId: string;
  postMessageId: number;
  minViewsRequired?: number;
}

export interface PostVerificationResultJobData {
  dealId: string;
  verified: boolean;
  viewsCount: number;
  isDeleted: boolean;
  error?: string;
}

// Job types for autopost
export interface AutopostJobData {
  dealId: string;
  channelId: string;
  telegramChannelId: string;
  contentText?: string;
  contentMediaUrls: string[];
}

export interface AutopostResultJobData {
  dealId: string;
  success: boolean;
  messageId?: number;
  postUrl?: string;
  error?: string;
}

// Job types for folder sync
export interface FolderSyncJobData {
  folderId: string;
  folderHash: string;
}

export interface FolderSyncResultJobData {
  folderId: string;
  success: boolean;
  channelsFound: number;
  channels?: Array<{
    telegramId: string;
    title: string;
    username?: string;
    subscriberCount: number;
  }>;
  error?: string;
}

// Notification types
export type NotificationType =
  | 'DEAL_CREATED'
  | 'DEAL_APPROVED'
  | 'DEAL_REJECTED'
  | 'DEAL_CANCELLED'
  | 'DEAL_POSTED'
  | 'DEAL_AUTO_RELEASED'
  | 'DEAL_DISPUTED'
  | 'DEAL_RESOLVED_RELEASE'
  | 'DEAL_RESOLVED_REFUND'
  | 'DEAL_EXPIRED'
  | 'CHANNEL_APPROVED'
  | 'CHANNEL_REJECTED'
  | 'PLACEMENT_REQUESTED'
  | 'PLACEMENT_APPROVED'
  | 'PLACEMENT_REJECTED'
  | 'APPEAL_FILED'
  | 'APPEAL_UPHELD'
  | 'APPEAL_REVERSED'
  | 'APPEAL_WINDOW_OPENED'
  | 'APPEAL_WINDOW_EXPIRED'
  | 'CONTENT_SUBMITTED'
  | 'CONTENT_APPROVED'
  | 'CONTENT_REJECTED'
  | 'DEAL_MESSAGE'
  | 'CAMPAIGN_STATUS_CHANGED'
  | 'CAMPAIGN_BUDGET_LOW';

export interface NotificationJobData {
  type: NotificationType;
  recipientUserId: string;
  data: {
    dealId?: string;
    channelId?: string;
    channelTitle?: string;
    folderTitle?: string;
    amount?: string;
    reason?: string;
    miniAppPath?: string;
    appealId?: string;
    campaignId?: string;
    campaignTitle?: string;
    newStatus?: string;
    budgetPercentRemaining?: number;
  };
}

// Job options
export interface JobOptions {
  delay?: number;
  attempts?: number;
  backoff?: {
    type: 'exponential' | 'fixed';
    delay: number;
  };
  removeOnComplete?: boolean | number;
  removeOnFail?: boolean | number;
  priority?: number;
}

// Default job options
export const DEFAULT_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 1000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export const NOTIFICATION_JOB_OPTIONS: JobOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 3000,
  },
  removeOnComplete: 100,
  removeOnFail: 500,
};

export const CRITICAL_JOB_OPTIONS: JobOptions = {
  attempts: 5,
  backoff: {
    type: 'exponential',
    delay: 2000,
  },
  removeOnComplete: false,
  removeOnFail: false,
};
