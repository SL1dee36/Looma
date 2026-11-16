// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { LoomaDb } from '../../db/index.js';
import { rooms } from '../../db/schema.js';
import { requireAuth } from '../auth/routes.js';
import type { RoomManager } from './roomManager.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateRoomCode(length = 6): string {
  const bytes = crypto.randomBytes(length);
  let code = '';
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return code;
}

export function registerRoomRoutes(
  app: FastifyInstance,
  db: LoomaDb,
  roomManager: RoomManager
) {
  app.get('/api/rooms', async () => {
    return { rooms: roomManager.listActiveRooms() };
  });

  app.post('/api/rooms', { preHandler: requireAuth }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      name?: unknown;
      maxUsers?: unknown;
      isPersistent?: unknown;
    };

    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    const name = rawName.length >= 2 && rawName.length <= 48 ? rawName : 'Кинозал';
    const maxUsers =
      typeof body.maxUsers === 'number' && body.maxUsers >= 2 && body.maxUsers <= 50
        ? Math.floor(body.maxUsers)
        : 20;
    const isPersistent = Boolean(body.isPersistent) && !request.user.isGuest;

    let code = generateRoomCode();
    for (let attempt = 0; attempt < 5; attempt++) {
      const exists = db.select({ id: rooms.id }).from(rooms).where(eq(rooms.code, code)).get();
      if (!exists) break;
      code = generateRoomCode();
    }

    const id = `rm_${crypto.randomUUID()}`;
    db.insert(rooms)
      .values({
        id,
        code,
        name,
        ownerId: request.user.sub,
        isPersistent,
        maxUsers,
        createdAt: Date.now(),
      })
      .run();

    roomManager.getOrInitRoom({
      code,
      name,
      ownerId: request.user.sub,
      isPersistent,
      maxUsers,
    });

    return reply.code(201).send({
      room: { code, name, maxUsers, isPersistent },
    });
  });

  app.get('/api/rooms/:code', async (request, reply) => {
    const { code } = request.params as { code: string };
    const normalizedCode = code.trim().toUpperCase();

    let live = roomManager.getRoom(normalizedCode);
    if (!live) {
      const dbRoom = db.select().from(rooms).where(eq(rooms.code, normalizedCode)).get();
      if (!dbRoom) {
        return reply.code(404).send({ error: 'Комната не найдена' });
      }
      live = roomManager.getOrInitRoom({
        code: dbRoom.code,
        name: dbRoom.name,
        ownerId: dbRoom.ownerId,
        isPersistent: dbRoom.isPersistent,
        maxUsers: dbRoom.maxUsers,
      });
    }

    return {
      room: {
        code: live.code,
        name: live.name,
        maxUsers: live.maxUsers,
        participantsCount: roomManager.getParticipants(live).length,
      },
    };
  });
}

