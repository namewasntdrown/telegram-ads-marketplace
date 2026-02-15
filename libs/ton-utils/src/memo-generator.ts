import { randomBytes, createHash } from 'crypto';

const MEMO_PREFIX = 'TAM';
const MEMO_RANDOM_BYTES = 8; // 64 bits of entropy (was 4)
const MEMO_USER_HASH_LENGTH = 6; // More of the user hash

export function generateDepositMemo(userId: string): string {
  // Use SHA256 of userId for consistent hashing, take first 6 chars
  const userHash = createHash('sha256')
    .update(userId)
    .digest('hex')
    .slice(0, MEMO_USER_HASH_LENGTH)
    .toUpperCase();

  // Generate 8 bytes (16 hex chars) of cryptographic randomness
  const random = randomBytes(MEMO_RANDOM_BYTES).toString('hex').toUpperCase();

  return `${MEMO_PREFIX}${userHash}${random}`;
}

export function parseDepositMemo(memo: string): {
  valid: boolean;
  userHash?: string;
} {
  // New format: TAM + 6 char user hash + 16 char random = 25 chars
  // Also support legacy format: TAM + 4 char user hash + 8 char random = 15 chars
  const NEW_MEMO_LENGTH = MEMO_PREFIX.length + MEMO_USER_HASH_LENGTH + MEMO_RANDOM_BYTES * 2;
  const LEGACY_MEMO_LENGTH = MEMO_PREFIX.length + 4 + 8;

  if (!memo.startsWith(MEMO_PREFIX)) {
    return { valid: false };
  }

  // Validate format (alphanumeric only)
  if (!/^[A-Z0-9]+$/.test(memo)) {
    return { valid: false };
  }

  if (memo.length === NEW_MEMO_LENGTH) {
    const userHash = memo.slice(MEMO_PREFIX.length, MEMO_PREFIX.length + MEMO_USER_HASH_LENGTH);
    return { valid: true, userHash };
  }

  if (memo.length === LEGACY_MEMO_LENGTH) {
    const userHash = memo.slice(MEMO_PREFIX.length, MEMO_PREFIX.length + 4);
    return { valid: true, userHash };
  }

  return { valid: false };
}

export function validateMemo(memo: string): boolean {
  const { valid } = parseDepositMemo(memo);
  return valid;
}

export function generateUniqueDepositId(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = randomBytes(4).toString('hex').toUpperCase();
  return `DEP${timestamp}${random}`;
}
