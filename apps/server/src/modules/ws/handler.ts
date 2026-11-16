// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import type { ClientWsMessage, MediaItem } from '@looma/shared';
import type { LoomaDb } from '../../db/index.js';
import { rooms } from '../../db/schema.js';
import type { JwtPayload } from '../auth/routes.js';
import { type LiveRoom, type RoomConnection, type RoomManager } from '../rooms/roomManager.js';

function announceNowPlaying(roomManager: RoomManager, room: LiveRoom, item: MediaItem) {
  const lines = [`Сейчас играет: ${item.title}`];
  if (item.description) {
    lines.push(item.description);
  }
  const botMsg = roomManager.pushMessage(room, {
    userId: 'bot',
    username: 'Looma Бот',
    text: lines.join('\n'),
    isBot: true,
  });
  roomManager.broadcast(room, { type: 'chat:message', message: botMsg });
}

export function registerWsRoutes(
  app: FastifyInstance,
  db: LoomaDb,
  roomManager: RoomManager
) {
  app.get('/ws/rooms/:code', { websocket: true }, (socket, request) => {
    const { code } = request.params as { code: string };
    const query = request.query as { token?: string };
    const normalizedCode = code.trim().toUpperCase();

    if (!query.token) {
      socket.close(4001, 'Missing auth token');
      return;
    }

    let user: JwtPayload;
    try {
      user = app.jwt.verify<JwtPayload>(query.token);
    } catch {
      socket.close(4001, 'Invalid auth token');
      return;
    }

    let room = roomManager.getRoom(normalizedCode);
    if (!room) {
      const dbRoom = db.select().from(rooms).where(eq(rooms.code, normalizedCode)).get();
      if (!dbRoom) {
        socket.close(4004, 'Room not found');
        return;
      }
      room = roomManager.getOrInitRoom({
        code: dbRoom.code,
        name: dbRoom.name,
        ownerId: dbRoom.ownerId,
        isPersistent: dbRoom.isPersistent,
        maxUsers: dbRoom.maxUsers,
      });
    }

    const conn: RoomConnection = {
      socket,
      userId: user.sub,
      username: user.username,
      isGuest: user.isGuest,
    };

    const wasAlreadyPresent = roomManager.hasUser(room, conn.userId);
    const added = roomManager.addConnection(room, conn);
    if (!added) {
      socket.close(4003, 'Room is full');
      return;
    }

    roomManager.send(conn, {
      type: 'room:state',
      state: roomManager.getSnapshot(room),
      serverTime: Date.now(),
    });

    roomManager.broadcast(
      room,
      {
        type: 'participants:updated',
        participants: roomManager.getParticipants(room),
        hostId: room.hostId,
      },
      conn
    );

    if (!wasAlreadyPresent) {
      const joinMsg = roomManager.pushMessage(room, {
        userId: 'system',
        username: 'Looma',
        text: `${conn.username} присоединился к просмотру`,
        system: true,
      });
      roomManager.broadcast(room, { type: 'chat:message', message: joinMsg }, conn);
    }

    socket.on('message', (raw: Buffer) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientWsMessage;
      } catch {
        return;
      }

      const now = Date.now();

      switch (msg.type) {
        case 'ping': {
          roomManager.send(conn, {
            type: 'pong',
            clientTime: msg.clientTime,
            serverTime: now,
          });
          break;
        }

        case 'chat:send': {
          const text = typeof msg.text === 'string' ? msg.text.trim() : '';
          if (!text || text.length > 1000) return;
          const chatMsg = roomManager.pushMessage(room, {
            userId: conn.userId,
            username: conn.username,
            text,
            isGuest: conn.isGuest,
          });
          roomManager.broadcast(room, { type: 'chat:message', message: chatMsg });
          break;
        }

        case 'room:toggle_control': {
          if (room.hostId !== conn.userId && room.ownerId !== conn.userId) {
            roomManager.send(conn, {
              type: 'error',
              message: 'Только хост может менять права управления',
            });
            return;
          }
          room.allowEveryoneControl = Boolean(msg.allowEveryone);
          roomManager.broadcast(room, {
            type: 'room:settings',
            allowEveryoneControl: room.allowEveryoneControl,
          });
          break;
        }

        case 'player:play': {
          if (!roomManager.canControl(room, conn.userId)) return;
          room.playback.isPlaying = true;
          room.playback.baseTime = Math.max(0, Number(msg.time) || 0);
          room.playback.updatedAt = now;
          roomManager.broadcast(room, {
            type: 'player:sync',
            playback: { ...room.playback },
            serverTime: now,
            actorId: conn.userId,
          });
          break;
        }

        case 'player:pause': {
          if (!roomManager.canControl(room, conn.userId)) return;
          room.playback.isPlaying = false;
          room.playback.baseTime = Math.max(0, Number(msg.time) || 0);
          room.playback.updatedAt = now;
          roomManager.broadcast(room, {
            type: 'player:sync',
            playback: { ...room.playback },
            serverTime: now,
            actorId: conn.userId,
          });
          break;
        }

        case 'player:seek': {
          if (!roomManager.canControl(room, conn.userId)) return;
          room.playback.baseTime = Math.max(0, Number(msg.time) || 0);
          room.playback.updatedAt = now;
          roomManager.broadcast(room, {
            type: 'player:sync',
            playback: { ...room.playback },
            serverTime: now,
            actorId: conn.userId,
          });
          break;
        }

        case 'player:rate': {
          if (!roomManager.canControl(room, conn.userId)) return;
          const rate = Number(msg.rate);
          if (!Number.isFinite(rate) || rate < 0.25 || rate > 3) return;
          room.playback.baseTime = Math.max(0, Number(msg.time) || 0);
          room.playback.playbackRate = rate;
          room.playback.updatedAt = now;
          roomManager.broadcast(room, {
            type: 'player:sync',
            playback: { ...room.playback },
            serverTime: now,
            actorId: conn.userId,
          });
          break;
        }

        case 'player:select_stream': {
          if (!roomManager.canControl(room, conn.userId) || !room.playback.media) return;
          const idx = Math.floor(Number(msg.streamIndex));
          if (idx < 0 || idx >= room.playback.media.streams.length) return;
          room.playback.media = {
            ...room.playback.media,
            selectedStreamIndex: idx,
          };
          roomManager.broadcast(room, {
            type: 'player:sync',
            playback: { ...room.playback },
            serverTime: now,
            actorId: conn.userId,
          });
          break;
        }

        case 'queue:add': {
          if (!roomManager.canControl(room, conn.userId)) return;
          const item = msg.item;
          if (!item || !item.title || !Array.isArray(item.streams) || item.streams.length === 0) {
            return;
          }
          const startedNow = !room.playback.media || msg.playNow;
          if (startedNow) {
            room.playback = {
              media: item,
              isPlaying: true,
              baseTime: 0,
              updatedAt: now,
              playbackRate: 1,
            };
          } else {
            room.queue.push(item);
          }
          roomManager.broadcast(room, {
            type: 'queue:updated',
            queue: [...room.queue],
            playback: { ...room.playback },
            serverTime: now,
          });
          if (startedNow) {
            announceNowPlaying(roomManager, room, item);
          }
          break;
        }

        case 'queue:remove': {
          if (!roomManager.canControl(room, conn.userId)) return;
          room.queue = room.queue.filter((q) => q.id !== msg.itemId);
          roomManager.broadcast(room, {
            type: 'queue:updated',
            queue: [...room.queue],
            playback: { ...room.playback },
            serverTime: now,
          });
          break;
        }

        case 'queue:play_index': {
          if (!roomManager.canControl(room, conn.userId)) return;
          const idx = Math.floor(Number(msg.index));
          if (idx < 0 || idx >= room.queue.length) return;
          const [selected] = room.queue.splice(idx, 1);
          room.playback = {
            media: selected,
            isPlaying: true,
            baseTime: 0,
            updatedAt: now,
            playbackRate: 1,
          };
          roomManager.broadcast(room, {
            type: 'queue:updated',
            queue: [...room.queue],
            playback: { ...room.playback },
            serverTime: now,
          });
          announceNowPlaying(roomManager, room, selected);
          break;
        }
      }
    });

    socket.on('close', () => {
      roomManager.removeConnection(room, conn);
      if (room.connections.size > 0) {
        roomManager.broadcast(room, {
          type: 'participants:updated',
          participants: roomManager.getParticipants(room),
          hostId: room.hostId,
        });
        if (!roomManager.hasUser(room, conn.userId)) {
          const leaveMsg = roomManager.pushMessage(room, {
            userId: 'system',
            username: 'Looma',
            text: `${conn.username} покинул комнату`,
            system: true,
          });
          roomManager.broadcast(room, { type: 'chat:message', message: leaveMsg });
        }
      }
    });
  });
}

