export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  MODERATOR = 'MODERATOR',
}

export enum ChannelStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REJECTED = 'REJECTED',
}

export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export enum DealStatus {
  // Новый упрощённый flow:
  // PENDING → (Approve) → SCHEDULED/POSTED → RELEASED
  // PENDING → (Reject) → CANCELLED

  PENDING = 'PENDING',           // Заявка создана, ожидает одобрения владельца канала
  SCHEDULED = 'SCHEDULED',       // Одобрено, средства заблокированы, ждёт scheduledPostTime
  POSTED = 'POSTED',             // Опубликовано в канале
  RELEASED = 'RELEASED',         // Средства выплачены владельцу канала
  DISPUTED = 'DISPUTED',         // Открыт спор
  REFUNDED = 'REFUNDED',         // Средства возвращены рекламодателю
  CANCELLED = 'CANCELLED',       // Отменено (владельцем или рекламодателем до одобрения)
  EXPIRED = 'EXPIRED',           // Истёк срок ожидания

  // Content approval flow
  CONTENT_PENDING = 'CONTENT_PENDING',       // Owner preparing content draft
  CONTENT_SUBMITTED = 'CONTENT_SUBMITTED',   // Draft submitted for advertiser review
  CONTENT_APPROVED = 'CONTENT_APPROVED',     // Content approved, ready to schedule

  // Legacy статусы для обратной совместимости (помечены как deprecated)
  /** @deprecated use PENDING */ DRAFT = 'DRAFT',
  /** @deprecated use PENDING */ AWAITING_DEPOSIT = 'AWAITING_DEPOSIT',
  /** @deprecated use SCHEDULED */ FUNDED = 'FUNDED',
  /** @deprecated use RELEASED */ AWAITING_VERIFICATION = 'AWAITING_VERIFICATION',
  /** @deprecated use RELEASED */ VERIFIED = 'VERIFIED',
}

export enum TransactionType {
  DEPOSIT = 'DEPOSIT',
  WITHDRAWAL = 'WITHDRAWAL',
  ESCROW_LOCK = 'ESCROW_LOCK',
  ESCROW_RELEASE = 'ESCROW_RELEASE',
  ESCROW_REFUND = 'ESCROW_REFUND',
  FEE = 'FEE',
  BOOST_CHANNEL = 'BOOST_CHANNEL',
  BOOST_FOLDER = 'BOOST_FOLDER',
  FOLDER_PLACEMENT = 'FOLDER_PLACEMENT',
  APPEAL_REVERSAL = 'APPEAL_REVERSAL',
}

export enum TransactionStatus {
  PENDING = 'PENDING',
  CONFIRMED = 'CONFIRMED',
  FAILED = 'FAILED',
}

export enum ContentType {
  TEXT = 'TEXT',
  PHOTO = 'PHOTO',
  VIDEO = 'VIDEO',
  DOCUMENT = 'DOCUMENT',
}

export enum DisputeReason {
  CONTENT_NOT_POSTED = 'CONTENT_NOT_POSTED',
  WRONG_CONTENT = 'WRONG_CONTENT',
  EARLY_DELETION = 'EARLY_DELETION',
  FAKE_STATISTICS = 'FAKE_STATISTICS',
  OTHER = 'OTHER',
}

export enum FolderStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  REJECTED = 'REJECTED',
}

export enum ChannelAdminRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
}

export enum FolderPlacementStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',     // Одобрено, средства в escrow на 3 дня
  COMPLETED = 'COMPLETED',   // Средства выплачены владельцу папки
  REJECTED = 'REJECTED',
  CANCELLED = 'CANCELLED',
}
