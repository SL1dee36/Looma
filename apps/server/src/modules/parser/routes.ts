// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import crypto from 'node:crypto';
import type { MediaItem } from '@looma/shared';
import { requireAuth } from '../auth/routes.js';
import { DirectMediaProvider } from './direct.js';
import { UniversalPageProvider } from './universal.js';
import { YouTubeProvider } from './youtube.js';
import type { MediaProvider } from './types.js';
import { registerStreamProxy } from './proxy.js';

export function registerMediaRoutes(app: FastifyInstance) {
  const providers: MediaProvider[] = [
    new YouTubeProvider(),
    new DirectMediaProvider(),
    new UniversalPageProvider(),
  ];

  registerStreamProxy(app);

  app.post('/api/media/resolve', { preHandler: requireAuth }, async (request, reply) => {
    const body = (request.body ?? {}) as { url?: unknown };
    let url = typeof body.url === 'string' ? body.url.trim() : '';
    if (!url) {
      return reply.code(400).send({ error: 'Вставьте ссылку на страницу с фильмом, YouTube или видео' });
    }

    if (!/^https?:\/\//i.test(url) && url.includes('.')) {
      url = `https://${url}`;
    }

    const provider = providers.find((p) => p.canResolve(url));
    if (!provider) {
      return reply.code(400).send({
        error: 'Некорректная или небезопасная ссылка (требуется http:// или https://)',
      });
    }

    try {
      const resolved = await provider.resolve(url);
      const item: MediaItem = {
        id: crypto.randomUUID(),
        title: resolved.title,
        description: resolved.description,
        source: resolved.source,
        sourceId: resolved.sourceId,
        poster: resolved.poster,
        duration: resolved.duration,
        prevEpisodeUrl: resolved.prevEpisodeUrl,
        nextEpisodeUrl: resolved.nextEpisodeUrl,
        streams: resolved.streams,
        selectedStreamIndex: 0,
        addedBy: request.user.username,
      };
      return { item };
    } catch (err) {
      request.log.warn({ err, url }, 'Media resolve failed');
      return reply.code(502).send({
        error: err instanceof Error ? err.message : 'Не удалось найти плеер по этой ссылке',
      });
    }
  });
}
