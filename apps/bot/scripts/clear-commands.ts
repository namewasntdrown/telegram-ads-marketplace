import { Bot } from 'grammy';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '../../.env.local' });
dotenv.config({ path: '../../.env' });

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error('❌ TELEGRAM_BOT_TOKEN not found in environment');
  process.exit(1);
}

async function clearCommands() {
  const bot = new Bot(BOT_TOKEN);

  try {
    console.log('🧹 Clearing all bot commands...');

    // Delete all commands
    await bot.api.deleteMyCommands();
    console.log('✅ All commands deleted');

    // Set only /start command
    await bot.api.setMyCommands([
      { command: 'start', description: 'Запустить бота' },
    ]);
    console.log('✅ Set /start command');

    // Get current commands to verify
    const commands = await bot.api.getMyCommands();
    console.log('\n📋 Current commands:');
    commands.forEach(cmd => {
      console.log(`  /${cmd.command} - ${cmd.description}`);
    });

    console.log('\n✨ Done! Bot commands updated.');
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }

  process.exit(0);
}

clearCommands();
