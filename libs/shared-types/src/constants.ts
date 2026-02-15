// Platform fee percentage (e.g., 5%)
export const PLATFORM_FEE_PERCENT = 5;

// Minimum amounts in TON
export const MIN_DEPOSIT_TON = '1';
export const MIN_WITHDRAWAL_TON = '0.5';
export const MIN_DEAL_AMOUNT_TON = '1';

// Network fees
export const ESTIMATED_NETWORK_FEE_TON = '0.05';

// Withdrawal limits
export const DAILY_WITHDRAWAL_LIMIT_TON = '1000';

// Time limits in milliseconds
export const DEPOSIT_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
export const CONTENT_SUBMISSION_DEADLINE_MS = 24 * 60 * 60 * 1000; // 24 hours
export const CONTENT_APPROVAL_DEADLINE_MS = 12 * 60 * 60 * 1000; // 12 hours
export const POST_VERIFICATION_DEADLINE_MS = 48 * 60 * 60 * 1000; // 48 hours
export const DEAL_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// JWT
export const JWT_ACCESS_EXPIRY = '15m';
export const JWT_REFRESH_EXPIRY = '7d';

// Rate limiting
export const RATE_LIMIT_TTL = 60; // seconds
export const RATE_LIMIT_MAX = 100; // requests per TTL
export const RATE_LIMIT_AUTH_MAX = 5; // auth attempts per TTL

// Pagination
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// Channel limits
export const MAX_CHANNELS_PER_USER = 50;
export const MIN_SUBSCRIBERS_FOR_LISTING = 100;

// Content limits
export const MAX_CONTENT_TEXT_LENGTH = 4096;
export const MAX_MEDIA_URLS = 10;
export const MAX_MEDIA_SIZE_MB = 50;

// Verification
export const MIN_POST_DURATION_HOURS = 24;
export const MIN_VIEWS_PERCENTAGE = 50; // Minimum percentage of avg views required

// Categories
export const CHANNEL_CATEGORIES = [
  'news',
  'entertainment',
  'technology',
  'business',
  'education',
  'lifestyle',
  'gaming',
  'music',
  'sports',
  'travel',
  'food',
  'fashion',
  'health',
  'crypto',
  'finance',
  'marketing',
  'other',
] as const;

// Languages
export const SUPPORTED_LANGUAGES = [
  'en',
  'ru',
  'uk',
  'de',
  'fr',
  'es',
  'pt',
  'it',
  'pl',
  'tr',
  'ar',
  'fa',
  'hi',
  'zh',
  'ja',
  'ko',
  'other',
] as const;

// Deal state transitions (упрощённый flow)
// PENDING → (Approve) → SCHEDULED/POSTED → RELEASED
// PENDING → (Reject) → CANCELLED
export const DEAL_STATE_TRANSITIONS: Record<string, string[]> = {
  PENDING: ['SCHEDULED', 'POSTED', 'CANCELLED', 'EXPIRED'],  // После одобрения: SCHEDULED (если есть расписание) или POSTED (если сразу)
  SCHEDULED: ['POSTED', 'CANCELLED', 'DISPUTED'],            // Ожидает времени постинга
  POSTED: ['RELEASED', 'DISPUTED'],                          // Опубликовано, после верификации → RELEASED
  DISPUTED: ['RELEASED', 'REFUNDED'],                        // Спор разрешается админом
  RELEASED: [],                                               // Терминальный: выплачено
  REFUNDED: [],                                               // Терминальный: возврат
  CANCELLED: [],                                              // Терминальный: отменено
  EXPIRED: [],                                                // Терминальный: истекло

  // Legacy (для обратной совместимости)
  DRAFT: ['PENDING', 'CANCELLED'],
  AWAITING_DEPOSIT: ['PENDING', 'CANCELLED'],
  FUNDED: ['SCHEDULED', 'POSTED'],
  CONTENT_PENDING: ['PENDING'],
  CONTENT_SUBMITTED: ['PENDING'],
  CONTENT_APPROVED: ['SCHEDULED', 'POSTED'],
  AWAITING_VERIFICATION: ['RELEASED'],
  VERIFIED: ['RELEASED'],
};
