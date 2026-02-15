import DOMPurify, { WindowLike } from 'dompurify';
import { JSDOM } from 'jsdom';

const { window } = new JSDOM('');
// JSDOM's window is compatible with DOMPurify's requirements
const purify = DOMPurify(window as unknown as WindowLike);

// Configure DOMPurify
purify.setConfig({
  ALLOWED_TAGS: ['b', 'i', 'u', 's', 'a', 'code', 'pre', 'br'],
  ALLOWED_ATTR: ['href'],
  ALLOW_DATA_ATTR: false,
  FORBID_TAGS: ['script', 'style', 'iframe', 'form', 'input'],
  FORBID_ATTR: ['onclick', 'onerror', 'onload', 'style'],
});

export function sanitizeHtml(dirty: string): string {
  return purify.sanitize(dirty);
}

export function sanitizeUrl(url: string): string | null {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    // Block common XSS patterns
    if (/javascript:|data:|vbscript:/i.test(url)) {
      return null;
    }

    return parsed.toString();
  } catch {
    return null;
  }
}

export function validateTonAddress(address: string): boolean {
  // TON address validation (simplified)
  // Raw format: 0:hex (67 chars) or user-friendly format (48 chars base64)
  const rawRegex = /^-?\d:[a-fA-F0-9]{64}$/;
  const friendlyRegex = /^[UEkK][Qf][a-zA-Z0-9_-]{46}$/;

  return rawRegex.test(address) || friendlyRegex.test(address);
}
