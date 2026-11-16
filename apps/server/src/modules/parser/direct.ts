// Author: Nazaryan Artem (@sl1dee36)
import type { MediaProvider, ResolvedMedia } from './types.js';

export class DirectMediaProvider implements MediaProvider {
  readonly name = 'direct';

  canResolve(url: string): boolean {
    return /^https?:\/\/.+\.(m3u8|mp4|webm|mkv)(\?.*)?$/i.test(url.trim());
  }

  async resolve(url: string): Promise<ResolvedMedia> {
    const cleanUrl = url.trim();
    const isHls = /\.m3u8(\?.*)?$/i.test(cleanUrl);
    const filename = cleanUrl.split('/').pop()?.split('?')[0] || 'Видео';

    return {
      title: decodeURIComponent(filename),
      source: 'direct',
      sourceId: cleanUrl,
      streams: [
        {
          quality: 'Original',
          url: cleanUrl,
          type: isHls ? 'hls' : 'mp4',
          label: isHls ? 'HLS Stream' : 'Direct Video',
        },
      ],
    };
  }
}

