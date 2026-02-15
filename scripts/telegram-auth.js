const { TelegramClient } = require('telegram');
const { StringSession } = require('telegram/sessions');
const readline = require('readline');

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '35736580', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '660a275ef4c255c7c7706bc6dff8a917';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n=== Telegram MTProto Authorization ===\n');
  console.log('This will create a session for accessing channel statistics.\n');

  const session = new StringSession('');
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question('Phone number (e.g., +79991234567): '),
    password: async () => await question('2FA password (or press Enter if none): '),
    phoneCode: async () => await question('Code from Telegram: '),
    onError: (err) => console.error('Error:', err),
  });

  console.log('\n✅ Authorization successful!\n');

  const sessionString = client.session.save();

  console.log('Add this to your .env file:\n');
  console.log('─'.repeat(60));
  console.log(`TELEGRAM_SESSION=${sessionString}`);
  console.log('─'.repeat(60));
  console.log('\nThen restart mtproto-worker:');
  console.log('docker compose -f docker-compose.prod.yml up -d mtproto-worker\n');

  await client.disconnect();
  rl.close();
}

main().catch(console.error);
