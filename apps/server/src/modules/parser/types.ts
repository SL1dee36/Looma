// Author: Nazaryan Artem (@sl1dee36)
import type { MediaStreamOption } from '@looma/shared';

export interface ResolvedMedia {
  title: string;
  description?: string;
  source: 'webpage' | 'youtube' | 'direct';
  sourceId: string;
  poster?: string;
  duration?: number;
  prevEpisodeUrl?: string;
  nextEpisodeUrl?: string;
  streams: MediaStreamOption[];
}

export interface MediaProvider {
  readonly name: string;
  canResolve(url: string): boolean;
  resolve(url: string): Promise<ResolvedMedia>;
}

