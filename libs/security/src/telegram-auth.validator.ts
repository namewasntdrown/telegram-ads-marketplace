import { createHmac } from 'crypto';

export interface TelegramUser {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
  photo_url?: string;
}

export interface TelegramInitData {
  query_id?: string;
  user?: TelegramUser;
  auth_date: number;
  hash: string;
  start_param?: string;
}

export interface ValidationResult {
  valid: boolean;
  data?: TelegramInitData;
  error?: string;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24 hours

export function validateTelegramWebAppData(
  initData: string,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): ValidationResult {
  if (!initData || !botToken) {
    return { valid: false, error: 'Missing initData or botToken' };
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');

    if (!hash) {
      return { valid: false, error: 'Missing hash in initData' };
    }

    // Remove hash from params for verification
    params.delete('hash');

    // Sort params alphabetically and create data check string
    const dataCheckArr: string[] = [];
    const sortedParams = Array.from(params.entries()).sort(([a], [b]) =>
      a.localeCompare(b)
    );

    for (const [key, value] of sortedParams) {
      dataCheckArr.push(`${key}=${value}`);
    }

    const dataCheckString = dataCheckArr.join('\n');

    // Create HMAC-SHA256 signature
    const secretKey = createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Verify hash
    if (calculatedHash !== hash) {
      return { valid: false, error: 'Invalid hash signature' };
    }

    // Parse and validate auth_date
    const authDateStr = params.get('auth_date');
    if (!authDateStr) {
      return { valid: false, error: 'Missing auth_date' };
    }

    const authDate = parseInt(authDateStr, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now - authDate > maxAgeSeconds) {
      return { valid: false, error: 'Auth data expired' };
    }

    // Parse user data
    const userStr = params.get('user');
    let user: TelegramUser | undefined;

    if (userStr) {
      try {
        user = JSON.parse(userStr) as TelegramUser;
      } catch {
        return { valid: false, error: 'Invalid user JSON' };
      }
    }

    const result: TelegramInitData = {
      auth_date: authDate,
      hash,
    };

    // Only add optional properties if they exist (exactOptionalPropertyTypes)
    if (user) {
      result.user = user;
    }
    const queryId = params.get('query_id');
    if (queryId) {
      result.query_id = queryId;
    }
    const startParam = params.get('start_param');
    if (startParam) {
      result.start_param = startParam;
    }

    return { valid: true, data: result };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}
