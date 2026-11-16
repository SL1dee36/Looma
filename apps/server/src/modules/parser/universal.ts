// Author: Nazaryan Artem (@sl1dee36)
import * as cheerio from 'cheerio';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { MediaStreamOption } from '@looma/shared';
import type { MediaProvider, ResolvedMedia } from './types.js';
import { parseSafePublicUrl } from './security.js';

const execFileAsync = promisify(execFile);

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const IGNORED_IFRAME_HOSTS = [
  'mc.yandex.ru',
  'googletagmanager.com',
  'google-analytics.com',
  'doubleclick.net',
  'vk.com/widget',
  't.me/',
  'facebook.com',
  'reclama',
];

interface CacheEntry {
  value: ResolvedMedia;
  expiresAt: number;
}

export class UniversalPageProvider implements MediaProvider {
  readonly name = 'webpage';
  private readonly cache = new Map<string, CacheEntry>();
  private readonly ttlMs = 15 * 60 * 1000;
  private readonly maxCacheSize = 100;

  canResolve(url: string): boolean {
    return parseSafePublicUrl(url) !== null;
  }

  private async fetchWithCurl(url: string, referer?: string): Promise<string> {
    const args = [
      '-sSL',
      '--max-time',
      '10',
      '-A',
      USER_AGENT,
      '-H',
      'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      '-H',
      'Accept-Language: ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
      '-w',
      '\n__STATUS__:%{http_code}',
    ];
    if (referer) {
      args.push('-e', referer);
    }
    args.push(url);

    const { stdout } = await execFileAsync('curl', args, {
      maxBuffer: 4 * 1024 * 1024,
      timeout: 11_000,
    });

    const marker = '\n__STATUS__:';
    const idx = stdout.lastIndexOf(marker);
    if (idx === -1) return stdout;
    const status = Number(stdout.slice(idx + marker.length).trim());
    const body = stdout.slice(0, idx);
    if (status >= 400) {
      throw new Error(`Сайт заблокировал запрос (${status})`);
    }
    return body;
  }

  private async fetchHtml(url: string, referer?: string): Promise<string> {
    const safeUrl = parseSafePublicUrl(url);
    if (!safeUrl) {
      throw new Error('Небезопасная или некорректная ссылка');
    }

    const res = await fetch(safeUrl.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
        'Sec-CH-UA': '"Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-CH-UA-Mobile': '?0',
        'Sec-CH-UA-Platform': '"Windows"',
        'Sec-Fetch-Dest': referer ? 'iframe' : 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': referer ? 'cross-site' : 'none',
        'Upgrade-Insecure-Requests': '1',
        Referer: referer ?? safeUrl.origin + '/',
      },
      signal: AbortSignal.timeout(12_000),
    });

    if (res.status === 403 || res.status === 406 || res.status === 503) {
      try {
        return await this.fetchWithCurl(safeUrl.toString(), referer ?? safeUrl.origin + '/');
      } catch {
        throw new Error(
          `Сайт заблокировал автоматический запрос (${res.status}). Попробуйте вставить прямую ссылку на плеер/поток или другой источник.`
        );
      }
    }

    if (!res.ok) {
      throw new Error(`Сайт ответил статусом ${res.status}`);
    }
    return res.text();
  }

  async resolve(url: string): Promise<ResolvedMedia> {
    const cleanUrl = url.trim();
    const cached = this.cache.get(cleanUrl);
    if (cached && Date.now() <= cached.expiresAt) {
      return cached.value;
    }

    const html = await this.fetchHtml(cleanUrl);
    const parsed = await this.parsePageHtml(html, cleanUrl);

    if (this.cache.size >= this.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(cleanUrl, { value: parsed, expiresAt: Date.now() + this.ttlMs });
    return parsed;
  }

  async parsePageHtml(html: string, pageUrl: string): Promise<ResolvedMedia> {
    const $ = cheerio.load(html);
    const baseOrigin = new URL(pageUrl).origin;

    const title = (
      $('meta[property="og:title"]').attr('content') ||
      $('h1').first().text() ||
      $('title').text() ||
      'Фильм'
    ).trim();

    const rawDesc = (
      $('meta[property="og:description"]').attr('content') ||
      $('meta[name="description"]').attr('content') ||
      ''
    )
      .replace(/\s+/g, ' ')
      .trim();
    const description =
      rawDesc.length > 220 ? `${rawDesc.slice(0, 217).trimEnd()}...` : rawDesc || undefined;

    const rawPoster =
      $('meta[property="og:image"]').attr('content') ||
      $('.poster img, .full-poster img, .film-poster img').first().attr('src');

    const poster = rawPoster
      ? rawPoster.startsWith('http')
        ? rawPoster
        : rawPoster.startsWith('//')
          ? `https:${rawPoster}`
          : `${baseOrigin}${rawPoster.startsWith('/') ? '' : '/'}${rawPoster}`
      : undefined;

    const { prevEpisodeUrl, nextEpisodeUrl } = this.extractEpisodeLinks($, pageUrl);
    const streams: MediaStreamOption[] = [];

    // 1. Direct <video> / <source> tags and inline scripts on the page
    $('video source, video').each((_, el) => {
      const src = $(el).attr('src') || $(el).attr('data-src');
      if (src) this.addStreamUrl(src, pageUrl, streams);
    });
    this.extractStreamUrlsFromText(html, pageUrl, streams);

    // 2. Inspect iframes & player tabs (video balancers / embedded players)
    const iframeUrls = this.extractIframeUrls($, pageUrl);
    for (const iframeUrl of iframeUrls.slice(0, 4)) {
      try {
        const iframeHtml = await this.fetchHtml(iframeUrl, pageUrl);
        this.extractStreamUrlsFromText(iframeHtml, iframeUrl, streams);
      } catch {
        // Ignore unreachable or blocked iframe, fallback to iframe embed below
      }
    }

    // 3. Always include iframe balancers as selectable options (useful for series: seasons/episodes/voiceovers)
    for (const [idx, iframeUrl] of iframeUrls.slice(0, 4).entries()) {
      let host = `Плеер ${idx + 1}`;
      try {
        host = new URL(iframeUrl).hostname.replace(/^www\./, '');
      } catch {
        // ignore
      }
      if (!streams.some((s) => s.url === iframeUrl)) {
        streams.push({
          quality: `Плеер: ${host}`,
          url: iframeUrl,
          type: 'iframe',
          label: `Плеер (${host}) — сезоны/озвучка`,
        });
      }
    }

    if (streams.length === 0) {
      throw new Error('На этой странице не удалось найти видеоплеер или поток (.m3u8 / .mp4 / iframe)');
    }

    return {
      title,
      description,
      source: 'webpage',
      sourceId: pageUrl,
      poster,
      prevEpisodeUrl,
      nextEpisodeUrl,
      streams,
    };
  }

  private extractEpisodeLinks(
    $: cheerio.CheerioAPI,
    pageUrl: string
  ): { prevEpisodeUrl?: string; nextEpisodeUrl?: string } {
    let prevEpisodeUrl: string | undefined;
    let nextEpisodeUrl: string | undefined;

    $('a[href]').each((_, el) => {
      const href = $(el).attr('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      const text = $(el).text().replace(/\s+/g, ' ').trim().toLowerCase();
      const rel = ($(el).attr('rel') || '').toLowerCase();

      const resolveHref = () => {
        try {
          const url = new URL(href, pageUrl).toString();
          return parseSafePublicUrl(url) ? url : undefined;
        } catch {
          return undefined;
        }
      };

      if (!prevEpisodeUrl && (rel === 'prev' || /предыдущ|пред\.\s*сери/i.test(text))) {
        prevEpisodeUrl = resolveHref();
      }
      if (!nextEpisodeUrl && (rel === 'next' || /следующ|след\.\s*сери/i.test(text))) {
        nextEpisodeUrl = resolveHref();
      }
    });

    return { prevEpisodeUrl, nextEpisodeUrl };
  }

  private extractIframeUrls($: cheerio.CheerioAPI, pageUrl: string): string[] {
    const urls: string[] = [];
    const seen = new Set<string>();

    const tryPush = (raw?: string) => {
      if (!raw || raw.startsWith('about:') || raw.startsWith('javascript:')) return;
      let resolved: string;
      try {
        const normalized = raw.startsWith('//') ? `https:${raw}` : raw;
        resolved = new URL(normalized, pageUrl).toString();
      } catch {
        return;
      }

      const lower = resolved.toLowerCase();
      if (IGNORED_IFRAME_HOSTS.some((blocked) => lower.includes(blocked))) return;
      if (!parseSafePublicUrl(resolved)) return;

      if (!seen.has(resolved)) {
        seen.add(resolved);
        urls.push(resolved);
      }
    };

    $('iframe').each((_, el) => {
      tryPush($(el).attr('data-src') || $(el).attr('src'));
    });

    $('[data-iframe], [data-player]').each((_, el) => {
      tryPush($(el).attr('data-iframe') || $(el).attr('data-player'));
    });

    return urls;
  }

  private extractStreamUrlsFromText(text: string, referer: string, out: MediaStreamOption[]) {
    const normalizedText = text.replace(/\\u002F/gi, '/').replace(/\\\//g, '/');
    const matches =
      normalizedText.match(/https?:\/\/[^\s"'<>\\`]+\.(?:m3u8|mp4)(?:\?[^\s"'<>\\`]*)?/gi) ?? [];

    for (const url of matches) {
      this.addStreamUrl(url, referer, out);
    }
  }

  private addStreamUrl(rawUrl: string, referer: string, out: MediaStreamOption[]) {
    let resolved: string;
    try {
      const normalized = rawUrl.startsWith('//') ? `https:${rawUrl}` : rawUrl;
      resolved = new URL(normalized, referer).toString();
    } catch {
      return;
    }

    if (!parseSafePublicUrl(resolved)) return;

    const isHls = /\.m3u8(\?|$)/i.test(resolved);
    const finalUrl = isHls
      ? `/api/proxy/stream?url=${encodeURIComponent(resolved)}&referer=${encodeURIComponent(referer)}`
      : resolved;

    if (out.some((s) => s.url === finalUrl)) return;

    const qualityMatch = resolved.match(/(\d{3,4}p)/i);
    out.push({
      quality: qualityMatch ? qualityMatch[1] : isHls ? 'Auto (HLS)' : 'MP4',
      url: finalUrl,
      type: isHls ? 'hls' : 'mp4',
      label: isHls ? 'HLS Stream' : 'MP4',
    });
  }
}
