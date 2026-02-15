import { TelegramClient } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as readline from 'readline';

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';

if (!API_ID || !API_HASH) {
  console.error('Please set TELEGRAM_API_ID and TELEGRAM_API_HASH environment variables');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      resolve(answer);
    });
  });
}

async function main() {
  console.log('Telegram Session Generator');
  console.log('==========================\n');

  const session = new StringSession('');
  const client = new TelegramClient(session, API_ID, API_HASH, {
    connectionRetries: 5,
  });

  await client.start({
    phoneNumber: async () => await question('Enter your phone number (with country code, e.g., +79991234567): '),
    password: async () => await question('Enter your 2FA password (if enabled, otherwise press Enter): '),
    phoneCode: async () => await question('Enter the code you received: '),
    onError: (err) => console.error('Error:', err),
  });

  console.log('\n✅ Successfully logged in!\n');

  const sessionString = client.session.save() as unknown as string;

  console.log('Add this line to your .env file:\n');
  console.log(`TELEGRAM_SESSION=${sessionString}`);
  console.log('\n');

  await client.disconnect();
  rl.close();
}

main().catch(console.error);
