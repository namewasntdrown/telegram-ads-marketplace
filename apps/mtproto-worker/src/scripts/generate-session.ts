/**
 * Telegram MTProto Session Generator
 *
 * Usage:
 *   Step 1: Request code
 *     TELEGRAM_API_ID=xxx TELEGRAM_API_HASH=xxx npx ts-node generate-session.ts --phone +79991234567
 *
 *   Step 2: Complete auth with code
 *     TELEGRAM_API_ID=xxx TELEGRAM_API_HASH=xxx npx ts-node generate-session.ts --phone +79991234567 --code 12345
 *
 *   Step 2b: If 2FA is enabled
 *     TELEGRAM_API_ID=xxx TELEGRAM_API_HASH=xxx npx ts-node generate-session.ts --phone +79991234567 --code 12345 --password yourpassword
 */

import { TelegramClient, Api } from 'telegram';
import { StringSession } from 'telegram/sessions';
import * as fs from 'fs';
import * as path from 'path';

const API_ID = parseInt(process.env.TELEGRAM_API_ID || '0', 10);
const API_HASH = process.env.TELEGRAM_API_HASH || '';
const STATE_FILE = path.join(__dirname, '.auth-state.json');

interface AuthState {
  phoneNumber: string;
  phoneCodeHash: string;
  session: string;
}

function parseArgs(): { phone?: string; code?: string; password?: string } {
  const args: { phone?: string; code?: string; password?: string } = {};
  const argv = process.argv.slice(2);

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--phone' && argv[i + 1]) {
      args.phone = argv[++i];
    } else if (argv[i] === '--code' && argv[i + 1]) {
      args.code = argv[++i];
    } else if (argv[i] === '--password' && argv[i + 1]) {
      args.password = argv[++i];
    }
  }

  return args;
}

function saveState(state: AuthState) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadState(): AuthState | null {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
  }
  return null;
}

function clearState() {
  if (fs.existsSync(STATE_FILE)) {
    fs.unlinkSync(STATE_FILE);
  }
}

async function main() {
  if (!API_ID || !API_HASH) {
    console.error('Error: TELEGRAM_API_ID and TELEGRAM_API_HASH must be set');
    process.exit(1);
  }

  const args = parseArgs();

  if (!args.phone) {
    console.log('Usage:');
    console.log('  Step 1: npx ts-node generate-session.ts --phone +79991234567');
    console.log('  Step 2: npx ts-node generate-session.ts --phone +79991234567 --code 12345');
    console.log('  With 2FA: npx ts-node generate-session.ts --phone +79991234567 --code 12345 --password pass');
    process.exit(1);
  }

  console.log('=== Telegram MTProto Session Generator ===\n');

  if (!args.code) {
    // Step 1: Send code request
    console.log('Step 1: Requesting verification code...\n');

    const stringSession = new StringSession('');
    const client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    const result = await client.invoke(
      new Api.auth.SendCode({
        phoneNumber: args.phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new Api.CodeSettings({}),
      })
    );

    const phoneCodeHash = (result as any).phoneCodeHash;
    // StringSession.save() returns string but typed as void
    const sessionStr = (client.session as StringSession).save() as unknown as string;

    saveState({
      phoneNumber: args.phone,
      phoneCodeHash,
      session: sessionStr || '',
    });

    console.log('Code sent to', args.phone);
    console.log('\nNext step:');
    console.log(`  npx ts-node generate-session.ts --phone ${args.phone} --code <CODE_FROM_TELEGRAM>`);

    await client.disconnect();
  } else {
    // Step 2: Complete sign in
    console.log('Step 2: Completing authentication...\n');

    const state = loadState();
    if (!state || state.phoneNumber !== args.phone) {
      console.error('Error: No pending auth for this phone. Run step 1 first.');
      process.exit(1);
    }

    const stringSession = new StringSession(state.session);
    const client = new TelegramClient(stringSession, API_ID, API_HASH, {
      connectionRetries: 5,
    });

    await client.connect();

    try {
      await client.invoke(
        new Api.auth.SignIn({
          phoneNumber: args.phone,
          phoneCodeHash: state.phoneCodeHash,
          phoneCode: args.code,
        })
      );
    } catch (err: any) {
      if (err.errorMessage === 'SESSION_PASSWORD_NEEDED') {
        if (!args.password) {
          console.error('2FA is enabled. Please provide password:');
          console.error(`  npx ts-node generate-session.ts --phone ${args.phone} --code ${args.code} --password YOUR_PASSWORD`);
          await client.disconnect();
          process.exit(1);
        }

        const passwordInfo = await client.invoke(new Api.account.GetPassword());
        const password = await (await import('telegram/Password')).computeCheck(
          passwordInfo,
          args.password
        );
        await client.invoke(new Api.auth.CheckPassword({ password }));
      } else {
        throw err;
      }
    }

    // StringSession.save() returns string but typed as void
    const sessionString = (client.session as StringSession).save() as unknown as string;

    console.log('\n=== SUCCESS ===\n');
    console.log('Add this to your .env file:\n');
    console.log(`TELEGRAM_SESSION=${sessionString}`);
    console.log('\n');

    const me = await client.getMe() as Api.User;
    console.log('Logged in as:', me.username || me.firstName || me.id.toString());

    clearState();
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error('Error:', err.message || err);
  process.exit(1);
});
