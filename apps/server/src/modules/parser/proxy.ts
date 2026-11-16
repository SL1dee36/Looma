// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import { Readable } from 'node:stream';
import { parseSafePublicUrl } from './security.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function rewriteM3u8(manifest: string, baseUrl: string, referer?: string): string {
  const refParam = referer ? `&referer=${encodeURIComponent(referer)}` : '';

  const toProxy = (rawUri: string) => {
    const resolved = new URL(rawUri, baseUrl).toString();
    return `/api/proxy/stream?url=${encodeURIComponent(resolved)}${refParam}`;
  };

  return manifest
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        // Rewrite URI="..." inside #EXT-X-KEY / #EXT-X-MEDIA tags
        return line.replace(/URI="([^"]+)"/g, (_, uri) => `URI="${toProxy(uri)}"`);
      }
      return toProxy(trimmed);
    })
    .join('\n');
}

export function registerStreamProxy(app: FastifyInstance) {
  app.get('/api/proxy/stream', async (request, reply) => {
    const query = request.query as { url?: string; referer?: string };
    if (!query.url) {
      return reply.code(400).send({ error: 'Missing url parameter' });
    }

    const target = parseSafePublicUrl(query.url);
    if (!target) {
      return reply.code(403).send({ error: 'Invalid or forbidden target URL' });
    }

    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': USER_AGENT,
        ...(query.referer ? { Referer: query.referer } : {}),
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!upstream.ok || !upstream.body) {
      return reply.code(upstream.status || 502).send({ error: 'Upstream stream error' });
    }

    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isPlaylist =
      contentType.includes('mpegurl') ||
      target.pathname.toLowerCase().endsWith('.m3u8');

    reply.header('Access-Control-Allow-Origin', '*');

    if (isPlaylist) {
      const text = await upstream.text();
      const rewritten = rewriteM3u8(text, target.toString(), query.referer);
      reply.type('application/vnd.apple.mpegurl');
      return reply.send(rewritten);
    }

    reply.type(contentType);
    const len = upstream.headers.get('content-length');
    if (len) reply.header('Content-Length', len);

    const nodeStream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
    return reply.send(nodeStream);
  });
}

