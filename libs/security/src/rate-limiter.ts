export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
  retryAfter?: number;
}

export const RATE_LIMIT_CONFIGS = {
  // General API rate limit
  default: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100,
  },

  // Auth endpoints (login, refresh)
  auth: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 5,
  },

  // Deposit/withdrawal operations
  financial: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 10,
  },

  // Deal creation
  deals: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 20,
  },

  // Channel verification requests
  verification: {
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 10,
  },

  // MTProto operations
  mtproto: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 30,
  },
} as const;

export type RateLimitType = keyof typeof RATE_LIMIT_CONFIGS;

export function createThrottlerConfig() {
  return {
    ttl: RATE_LIMIT_CONFIGS.default.windowMs,
    limit: RATE_LIMIT_CONFIGS.default.maxRequests,
  };
}

export function createRedisRateLimitKey(
  type: RateLimitType,
  identifier: string
): string {
  return `ratelimit:${type}:${identifier}`;
}
