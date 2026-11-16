// Author: Nazaryan Artem (@sl1dee36)
import type { WebSocket } from 'ws';
import crypto from 'node:crypto';
import type {
  ChatMessage,
  MediaItem,
  PlaybackState,
  RoomParticipant,
  RoomStateSnapshot,
  ServerWsMessage,
} from '@looma/shared';

export interface RoomConnection {
  socket: WebSocket;
  userId: string;
  username: string;
  isGuest: boolean;
}

export interface LiveRoom {
  code: string;
  name: string;
  ownerId: string;
  hostId: string;
  isPersistent: boolean;
  isHidden: boolean;
  maxUsers: number;
  allowEveryoneControl: boolean;
  playback: PlaybackState;
  queue: MediaItem[];
  connections: Set<RoomConnection>;
  messages: ChatMessage[];
  emptyTimer?: NodeJS.Timeout;
}

const MAX_MESSAGES_PER_ROOM = 40;
const EMPTY_ROOM_TTL_MS = 10 * 1000;

export function computePlaybackTime(playback: PlaybackState, now = Date.now()): number {
  if (!playback.isPlaying) return Math.max(0, playback.baseTime);
  const elapsedSec = Math.max(0, (now - playback.updatedAt) / 1000);
  return Math.max(0, playback.baseTime + elapsedSec * playback.playbackRate);
}

export class RoomManager {
  private rooms = new Map<string, LiveRoom>();
  private readonly onRoomBurned?: (code: string) => void;

  constructor(options?: { onRoomBurned?: (code: string) => void }) {
    this.onRoomBurned = options?.onRoomBurned;
  }

  getOrInitRoom(params: {
    code: string;
    name: string;
    ownerId: string;
    isPersistent: boolean;
    isHidden?: boolean;
    maxUsers: number;
  }): LiveRoom {
    const existing = this.rooms.get(params.code);
    if (existing) {
      if (existing.emptyTimer) {
        clearTimeout(existing.emptyTimer);
        existing.emptyTimer = undefined;
      }
      return existing;
    }

    const room: LiveRoom = {
      code: params.code,
      name: params.name,
      ownerId: params.ownerId,
      hostId: params.ownerId,
      isPersistent: params.isPersistent,
      isHidden: Boolean(params.isHidden),
      maxUsers: params.maxUsers,
      allowEveryoneControl: false,
      playback: {
        media: null,
        isPlaying: false,
        baseTime: 0,
        updatedAt: Date.now(),
        playbackRate: 1,
      },
      queue: [],
      connections: new Set(),
      messages: [],
    };
    this.rooms.set(params.code, room);
    return room;
  }

  getRoom(code: string): LiveRoom | undefined {
    return this.rooms.get(code);
  }

  listActiveRooms(filters?: {
    q?: string;
    usersFilter?: 'all' | 'with_users' | 'empty';
    minUsers?: number;
    control?: 'all' | 'everyone' | 'host';
    sortUsers?: 'none' | 'desc' | 'asc';
    limit?: number;
    offset?: number;
  }) {
    const q = filters?.q?.trim().toLowerCase() ?? '';
    const usersFilter = filters?.usersFilter ?? 'all';
    const minUsers = filters?.minUsers ?? 0;
    const control = filters?.control ?? 'all';
    const sortUsers = filters?.sortUsers ?? 'none';

    let list = Array.from(this.rooms.values())
      .filter((r) => !r.isHidden)
      .map((r) => ({
        code: r.code,
        name: r.name,
        participantsCount: this.getParticipants(r).length,
        maxUsers: r.maxUsers,
        currentTitle: r.playback.media?.title ?? null,
        allowEveryoneControl: r.allowEveryoneControl,
      }));

    if (q) {
      list = list.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.code.toLowerCase().includes(q) ||
          (r.currentTitle && r.currentTitle.toLowerCase().includes(q))
      );
    }

    if (usersFilter === 'with_users') {
      list = list.filter((r) => r.participantsCount > 0);
    } else if (usersFilter === 'empty') {
      list = list.filter((r) => r.participantsCount === 0);
    }

    if (minUsers > 0) {
      list = list.filter((r) => r.participantsCount >= minUsers);
    }

    if (control === 'everyone') {
      list = list.filter((r) => r.allowEveryoneControl);
    } else if (control === 'host') {
      list = list.filter((r) => !r.allowEveryoneControl);
    }

    if (sortUsers === 'desc') {
      list.sort((a, b) => b.participantsCount - a.participantsCount);
    } else if (sortUsers === 'asc') {
      list.sort((a, b) => a.participantsCount - b.participantsCount);
    }

    const total = list.length;
    const offset = Math.max(0, filters?.offset ?? 0);
    const limit = Math.min(50, Math.max(1, filters?.limit ?? 12));
    const items = list.slice(offset, offset + limit);

    return {
      items,
      total,
      hasMore: offset + items.length < total,
    };
  }

  addConnection(room: LiveRoom, conn: RoomConnection): boolean {
    const uniqueUsers = this.getParticipants(room);
    const alreadyInRoom = uniqueUsers.some((p) => p.userId === conn.userId);
    if (!alreadyInRoom && uniqueUsers.length >= room.maxUsers) {
      return false;
    }

    if (room.emptyTimer) {
      clearTimeout(room.emptyTimer);
      room.emptyTimer = undefined;
    }

    room.connections.add(conn);

    if (conn.userId === room.ownerId) {
      room.hostId = room.ownerId;
    } else if (!this.hasUser(room, room.hostId)) {
      room.hostId = conn.userId;
    }

    return true;
  }

  removeConnection(room: LiveRoom, conn: RoomConnection) {
    room.connections.delete(conn);

    if (!this.hasUser(room, room.hostId)) {
      const next = room.connections.values().next().value as RoomConnection | undefined;
      room.hostId = next ? next.userId : room.ownerId;
    }

    if (room.connections.size === 0 && !room.isPersistent) {
      room.emptyTimer = setTimeout(() => {
        if (room.connections.size === 0) {
          this.rooms.delete(room.code);
          this.onRoomBurned?.(room.code);
        }
      }, EMPTY_ROOM_TTL_MS);
    }
  }

  hasUser(room: LiveRoom, userId: string): boolean {
    for (const c of room.connections) {
      if (c.userId === userId) return true;
    }
    return false;
  }

  canControl(room: LiveRoom, userId: string): boolean {
    return room.allowEveryoneControl || room.hostId === userId || room.ownerId === userId;
  }

  getParticipants(room: LiveRoom): RoomParticipant[] {
    const map = new Map<string, RoomParticipant>();
    for (const c of room.connections) {
      if (!map.has(c.userId)) {
        map.set(c.userId, {
          userId: c.userId,
          username: c.username,
          isHost: c.userId === room.hostId,
          isGuest: c.isGuest,
        });
      }
    }
    return Array.from(map.values());
  }

  getSnapshot(room: LiveRoom): RoomStateSnapshot {
    return {
      code: room.code,
      name: room.name,
      ownerId: room.ownerId,
      hostId: room.hostId,
      isPersistent: room.isPersistent,
      isHidden: room.isHidden,
      allowEveryoneControl: room.allowEveryoneControl,
      playback: { ...room.playback },
      queue: [...room.queue],
      participants: this.getParticipants(room),
      messages: [...room.messages],
    };
  }

  pushMessage(room: LiveRoom, msg: Omit<ChatMessage, 'id' | 'createdAt'>): ChatMessage {
    const full: ChatMessage = {
      ...msg,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    room.messages.push(full);
    if (room.messages.length > MAX_MESSAGES_PER_ROOM) {
      room.messages.splice(0, room.messages.length - MAX_MESSAGES_PER_ROOM);
    }
    return full;
  }

  broadcast(room: LiveRoom, payload: ServerWsMessage, exclude?: RoomConnection) {
    const raw = JSON.stringify(payload);
    for (const conn of room.connections) {
      if (conn === exclude) continue;
      if (conn.socket.readyState === 1 ) {
        conn.socket.send(raw);
      }
    }
  }

  send(conn: RoomConnection, payload: ServerWsMessage) {
    if (conn.socket.readyState === 1) {
      conn.socket.send(JSON.stringify(payload));
    }
  }

  forceDeleteRoom(code: string) {
    const room = this.rooms.get(code);
    if (room?.emptyTimer) {
      clearTimeout(room.emptyTimer);
    }
    this.rooms.delete(code);
  }

  dispose() {
    for (const room of this.rooms.values()) {
      if (room.emptyTimer) {
        clearTimeout(room.emptyTimer);
        room.emptyTimer = undefined;
      }
    }
    this.rooms.clear();
  }
}

