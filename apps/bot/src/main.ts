import { Bot, session, GrammyError, HttpError } from 'grammy';
import { prisma } from '@tam/prisma-client';
import { setupCommands } from './commands/index.js';
import { authMiddleware } from './middlewares/auth.middleware.js';
import { rateLimitMiddleware } from './middlewares/rate-limit.middleware.js';
import type { BotContext, SessionData } from './types.js';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;
const WEBAPP_URL = process.env.MINI_APP_URL ?? 'https://example.com';

if (!BOT_TOKEN) {
  throw new Error('BOT_TOKEN is required');
}

const bot = new Bot<BotContext>(BOT_TOKEN);

// Session middleware
bot.use(
  session({
    initial: (): SessionData => ({
      user: null,
    }),
  })
);

// Rate limiting
bot.use(rateLimitMiddleware);

// Auth middleware - creates/fetches user from DB
bot.use(authMiddleware);

// Error handler
bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);

  const e = err.error;
  if (e instanceof GrammyError) {
    console.error('Error in request:', e.description);
  } else if (e instanceof HttpError) {
    console.error('Could not contact Telegram:', e);
  } else {
    console.error('Unknown error:', e);
  }
});

// Graceful shutdown
const shutdown = async () => {
  console.log('Shutting down bot...');
  await bot.stop();
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start bot
console.log('Starting Telegram bot...');
bot.start({
  onStart: async () => {
    // Setup commands after bot starts
    await setupCommands(bot, WEBAPP_URL);
    console.log('Bot started successfully');
  },
});
