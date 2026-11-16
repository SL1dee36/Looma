// Author: Nazaryan Artem (@sl1dee36)
import { create } from 'zustand';
import type {
  ChatMessage,
  ClientWsMessage,
  MediaItem,
  PlaybackState,
  RoomParticipant,
  ServerWsMessage,
} from '@looma/shared';

interface RoomStoreState {
  status: 'disconnected' | 'connecting' | 'connected' | 'error';
  error: string | null;
  code: string | null;
  name: string;
  ownerId: string | null;
  hostId: string | null;
  isPersistent: boolean;
  isHidden: boolean;
  allowEveryoneControl: boolean;
  allowedDomains: string[];
  playback: PlaybackState | null;
  queue: MediaItem[];
  participants: RoomParticipant[];
  messages: ChatMessage[];
  serverTimeOffsetMs: number;
  latencyMs: number | null;
  socket: WebSocket | null;
  pingTimer: number | null;

  connect: (code: string, token: string) => void;
  disconnect: () => void;
  send: (msg: ClientWsMessage) => void;
  getExpectedPlaybackTime: () => number;
}

export const useRoomStore = create<RoomStoreState>((set, get) => ({
  status: 'disconnected',
  error: null,
  code: null,
  name: '',
  ownerId: null,
  hostId: null,
  isPersistent: false,
  isHidden: false,
  allowEveryoneControl: false,
  allowedDomains: [],
  playback: null,
  queue: [],
  participants: [],
  messages: [],
  serverTimeOffsetMs: 0,
  latencyMs: null,
  socket: null,
  pingTimer: null,

  connect: (code, token) => {
    const prev = get();
    if (prev.socket) {
      prev.socket.close();
    }
    if (prev.pingTimer) {
      window.clearInterval(prev.pingTimer);
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/rooms/${encodeURIComponent(
      code
    )}?token=${encodeURIComponent(token)}`;

    set({ status: 'connecting', error: null, code });
    const ws = new WebSocket(wsUrl);

    const pingTimer = window.setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
      }
    }, 10_000);

    ws.onopen = () => {
      if (get().socket !== ws) return;
      set({ status: 'connected', error: null });
      ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
    };

    ws.onmessage = (event) => {
      if (get().socket !== ws) return;
      let msg: ServerWsMessage;
      try {
        msg = JSON.parse(event.data) as ServerWsMessage;
      } catch {
        return;
      }

      switch (msg.type) {
        case 'room:state':
          set({
            code: msg.state.code,
            name: msg.state.name,
            ownerId: msg.state.ownerId,
            hostId: msg.state.hostId,
            isPersistent: msg.state.isPersistent,
            isHidden: msg.state.isHidden,
            allowEveryoneControl: msg.state.allowEveryoneControl,
            allowedDomains: msg.state.allowedDomains ?? [],
            playback: msg.state.playback,
            queue: msg.state.queue,
            participants: msg.state.participants,
            messages: msg.state.messages,
            serverTimeOffsetMs: msg.serverTime - Date.now(),
          });
          break;

        case 'player:sync':
          set({
            playback: msg.playback,
            serverTimeOffsetMs: msg.serverTime - Date.now(),
          });
          break;

        case 'queue:updated':
          set({
            queue: msg.queue,
            playback: msg.playback,
            serverTimeOffsetMs: msg.serverTime - Date.now(),
          });
          break;

        case 'participants:updated':
          set({
            participants: msg.participants,
            hostId: msg.hostId,
          });
          break;

        case 'room:settings':
          set((s) => ({
            allowEveryoneControl: msg.allowEveryoneControl,
            isPersistent: msg.isPersistent ?? s.isPersistent,
            isHidden: msg.isHidden ?? s.isHidden,
          }));
          break;

        case 'chat:message':
          set((s) => ({
            messages: [...s.messages.slice(-39), msg.message],
          }));
          break;

        case 'pong': {
          const rtt = Date.now() - msg.clientTime;
          const offset = msg.serverTime + rtt / 2 - Date.now();
          set({
            latencyMs: Math.round(rtt),
            serverTimeOffsetMs: offset,
          });
          break;
        }

        case 'error':
          set({ error: msg.message });
          break;
      }
    };

    ws.onclose = (ev) => {
      window.clearInterval(pingTimer);
      if (get().socket !== ws) return;
      set({
        socket: null,
        pingTimer: null,
        status: ev.code === 1000 ? 'disconnected' : 'error',
        error: ev.reason || (ev.code === 4004 ? 'Комната не найдена' : null),
      });
    };

    set({ socket: ws, pingTimer });
  },

  disconnect: () => {
    const { socket, pingTimer } = get();
    if (pingTimer) window.clearInterval(pingTimer);
    if (socket) socket.close(1000, 'Leave room');
    set({
      socket: null,
      pingTimer: null,
      status: 'disconnected',
      code: null,
      playback: null,
      queue: [],
      participants: [],
      messages: [],
    });
  },

  send: (msg) => {
    const { socket } = get();
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(msg));
    }
  },

  getExpectedPlaybackTime: () => {
    const { playback, serverTimeOffsetMs } = get();
    if (!playback) return 0;
    if (!playback.isPlaying) return Math.max(0, playback.baseTime);
    const serverNow = Date.now() + serverTimeOffsetMs;
    const elapsedSec = Math.max(0, (serverNow - playback.updatedAt) / 1000);
    return Math.max(0, playback.baseTime + elapsedSec * playback.playbackRate);
  },
}));

