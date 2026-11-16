// Author: Nazaryan Artem (@sl1dee36)
import type { MediaProvider, ResolvedMedia } from './types.js';

const YT_REGEX =
  /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function extractYouTubeId(url: string): string | null {
  const match = url.match(YT_REGEX);
  return match ? match[1] : null;
}

export class YouTubeProvider implements MediaProvider {
  readonly name = 'youtube';

  canResolve(url: string): boolean {
    return extractYouTubeId(url) !== null;
  }

  async resolve(url: string): Promise<ResolvedMedia> {
    const videoId = extractYouTubeId(url);
    if (!videoId) {
      throw new Error('Некорректная ссылка на YouTube');
    }

    let title = `YouTube (${videoId})`;
    let description: string | undefined;
    let poster = `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;

    try {
      const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
        `https://www.youtube.com/watch?v=${videoId}`
      )}&format=json`;
      const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const data = (await res.json()) as {
          title?: string;
          author_name?: string;
          thumbnail_url?: string;
        };
        if (data.title) title = data.title;
        if (data.author_name) description = `Канал: ${data.author_name}`;
        if (data.thumbnail_url) poster = data.thumbnail_url;
      }
    } catch {
    }

    return {
      title,
      description,
      source: 'youtube',
      sourceId: videoId,
      poster,
      streams: [
        {
          quality: 'Auto',
          url: videoId,
          type: 'youtube',
          label: 'YouTube Player',
        },
      ],
    };
  }
}

