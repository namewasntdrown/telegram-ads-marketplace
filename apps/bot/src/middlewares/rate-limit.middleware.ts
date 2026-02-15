import type { MiddlewareFn } from 'grammy';
import type { BotContext } from '../types.js';

const userLastMessage = new Map<number, number>();
const RATE_LIMIT_MS = 500; // 500ms between messages

export const rateLimitMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const userId = ctx.from?.id;

  if (!userId) {
    return next();
  }

  const now = Date.now();
  const lastMessage = userLastMessage.get(userId);

  if (lastMessage && now - lastMessage < RATE_LIMIT_MS) {
    // Rate limited - silently ignore
    return;
  }

  userLastMessage.set(userId, now);

  // Clean up old entries periodically
  if (userLastMessage.size > 10000) {
    const cutoff = now - 60000; // Remove entries older than 1 minute
    for (const [id, timestamp] of userLastMessage.entries()) {
      if (timestamp < cutoff) {
        userLastMessage.delete(id);
      }
    }
  }

  return next();
};
