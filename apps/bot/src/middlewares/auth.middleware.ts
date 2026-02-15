import type { MiddlewareFn } from 'grammy';
import { prisma } from '@tam/prisma-client';
import type { BotContext } from '../types.js';

export const authMiddleware: MiddlewareFn<BotContext> = async (ctx, next) => {
  const telegramUser = ctx.from;

  if (!telegramUser) {
    return next();
  }

  try {
    // Find or create user
    let user = await prisma.user.findUnique({
      where: { telegramId: BigInt(telegramUser.id) },
    });

    if (!user) {
      user = await prisma.user.create({
        data: {
          telegramId: BigInt(telegramUser.id),
          username: telegramUser.username,
          firstName: telegramUser.first_name,
          lastName: telegramUser.last_name,
        },
      });
      console.log(`New user created: ${user.id}`);
    } else {
      // Update user info if changed
      if (
        user.username !== telegramUser.username ||
        user.firstName !== telegramUser.first_name ||
        user.lastName !== telegramUser.last_name
      ) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: {
            username: telegramUser.username,
            firstName: telegramUser.first_name,
            lastName: telegramUser.last_name,
          },
        });
      }
    }

    ctx.session.user = user;
  } catch (error) {
    console.error('Auth middleware error:', error);
  }

  return next();
};
