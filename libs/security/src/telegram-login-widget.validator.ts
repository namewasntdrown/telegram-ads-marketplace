import { createHash, createHmac, timingSafeEqual } from 'crypto';

export interface TelegramLoginWidgetData {
  id: number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: number;
  hash: string;
}

export interface LoginWidgetValidationResult {
  valid: boolean;
  data?: TelegramLoginWidgetData;
  error?: string;
}

const MAX_AUTH_AGE_SECONDS = 86400; // 24 hours

export function validateTelegramLoginWidget(
  widgetData: TelegramLoginWidgetData,
  botToken: string,
  maxAgeSeconds: number = MAX_AUTH_AGE_SECONDS
): LoginWidgetValidationResult {
  if (!widgetData || !botToken) {
    return { valid: false, error: 'Missing widget data or botToken' };
  }

  try {
    const { hash, ...data } = widgetData;

    if (!hash) {
      return { valid: false, error: 'Missing hash in widget data' };
    }

    // Build data-check-string: sort fields alphabetically, join with \n
    const dataCheckArr: string[] = [];
    const entries = Object.entries(data) as [string, string | number | undefined][];
    entries.sort(([a], [b]) => a.localeCompare(b));

    for (const [key, value] of entries) {
      if (value !== undefined && value !== null) {
        dataCheckArr.push(`${key}=${value}`);
      }
    }

    const dataCheckString = dataCheckArr.join('\n');

    // Login Widget uses SHA256(botToken) as secret, NOT HMAC("WebAppData", botToken)
    const secretKey = createHash('sha256').update(botToken).digest();

    const calculatedHash = createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    const hashBuffer = Buffer.from(hash, 'hex');
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');

    if (hashBuffer.length !== calculatedBuffer.length || !timingSafeEqual(hashBuffer, calculatedBuffer)) {
      return { valid: false, error: 'Invalid hash signature' };
    }

    // Validate auth_date freshness
    const authDate = Number(widgetData.auth_date);
    if (!authDate) {
      return { valid: false, error: 'Missing auth_date' };
    }

    const now = Math.floor(Date.now() / 1000);
    if (now - authDate > maxAgeSeconds) {
      return { valid: false, error: 'Auth data expired' };
    }

    return { valid: true, data: widgetData };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    };
  }
}
