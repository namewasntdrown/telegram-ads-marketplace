import type { Bot } from 'grammy';
import { InlineKeyboard } from 'grammy';
import type { BotContext } from '../types.js';

export async function setupCommands(bot: Bot<BotContext>, webAppUrl: string): Promise<void> {
  // /start command - единственная команда
  bot.command('start', async (ctx) => {
    const firstName = ctx.session.user?.firstName ?? ctx.from?.first_name ?? '';

    const keyboard = new InlineKeyboard()
      .webApp('Открыть', webAppUrl);

    await ctx.reply(
      `Привет${firstName ? `, ${firstName}` : ''}! 👋\n\n` +
        `Добро пожаловать в Telegram Ads Marketplace — платформу для покупки и продажи рекламы в Telegram каналах.\n\n` +
        `🔹 Владельцам каналов: размещайте рекламу и зарабатывайте\n` +
        `🔹 Рекламодателям: находите каналы для продвижения\n\n` +
        `Нажмите кнопку ниже, чтобы начать:`,
      {
        reply_markup: keyboard,
      }
    );
  });

  // Обработка текстовых сообщений (не команд)
  bot.on('message:text', async (ctx) => {
    // Игнорируем команды
    if (ctx.message.text.startsWith('/')) {
      return;
    }

    const keyboard = new InlineKeyboard()
      .webApp('Открыть', webAppUrl);

    await ctx.reply(
      `Используйте кнопку ниже для работы с платформой:`,
      {
        reply_markup: keyboard,
      }
    );
  });

  // Устанавливаем только команду start в меню
  await bot.api.setMyCommands([
    { command: 'start', description: 'Запустить бота' },
  ]);

  console.log('✅ Bot commands set successfully');
}
