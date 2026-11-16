// Author: Nazaryan Artem (@sl1dee36)
export function isForbiddenHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h.endsWith('.local')) {
    return true;
  }
  if (/^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(h)) {
    return true;
  }
  return false;
}

export function parseSafePublicUrl(rawUrl: string): URL | null {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
    if (isForbiddenHost(parsed.hostname)) return null;
    return parsed;
  } catch {
    return null;
  }
}

