// Author: Nazaryan Artem (@sl1dee36)
export interface UserDTO {
  id: string;
  username: string;
  isGuest: boolean;
}

export type StreamType = 'hls' | 'mp4' | 'youtube' | 'iframe';

export interface MediaStreamOption {
  quality: string;
  url: string;
  type: StreamType;
  label?: string;
}

export interface MediaItem {
  id: string;
  title: string;
  description?: string;
  source: 'webpage' | 'youtube' | 'direct';
  sourceId: string;
  poster?: string;
  duration?: number;
  prevEpisodeUrl?: string;
  nextEpisodeUrl?: string;
  streams: MediaStreamOption[];
  selectedStreamIndex: number;
  addedBy: string;
}

export interface PlaybackState {
  media: MediaItem | null;
  isPlaying: boolean;
  baseTime: number;
  updatedAt: number;
  playbackRate: number;
}

export interface RoomParticipant {
  userId: string;
  username: string;
  isHost: boolean;
  isGuest: boolean;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  createdAt: number;
  system?: boolean;
  isBot?: boolean;
  isGuest?: boolean;
}

export interface RoomStateSnapshot {
  code: string;
  name: string;
  hostId: string;
  allowEveryoneControl: boolean;
  playback: PlaybackState;
  queue: MediaItem[];
  participants: RoomParticipant[];
  messages: ChatMessage[];
}

export type ClientWsMessage =
  | { type: 'player:play'; time: number }
  | { type: 'player:pause'; time: number }
  | { type: 'player:seek'; time: number }
  | { type: 'player:rate'; rate: number; time: number }
  | { type: 'player:select_stream'; streamIndex: number }
  | { type: 'queue:add'; item: MediaItem; playNow?: boolean }
  | { type: 'queue:remove'; itemId: string }
  | { type: 'queue:play_index'; index: number }
  | { type: 'room:toggle_control'; allowEveryone: boolean }
  | { type: 'chat:send'; text: string }
  | { type: 'ping'; clientTime: number };

export type ServerWsMessage =
  | { type: 'room:state'; state: RoomStateSnapshot; serverTime: number }
  | { type: 'player:sync'; playback: PlaybackState; serverTime: number; actorId: string }
  | { type: 'queue:updated'; queue: MediaItem[]; playback: PlaybackState; serverTime: number }
  | { type: 'participants:updated'; participants: RoomParticipant[]; hostId: string }
  | { type: 'room:settings'; allowEveryoneControl: boolean }
  | { type: 'chat:message'; message: ChatMessage }
  | { type: 'pong'; clientTime: number; serverTime: number }
  | { type: 'error'; message: string };

