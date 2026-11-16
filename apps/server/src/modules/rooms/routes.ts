// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import { and, eq, ne } from 'drizzle-orm';
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
  app.get('/api/rooms', async (request) => {
    const query = request.query as {
      q?: string;
      usersFilter?: string;
      minUsers?: string;
      control?: string;
      sortUsers?: string;
      limit?: string;
      offset?: string;
    };

    const limit = query.limit ? Number(query.limit) : 12;
    const offset = query.offset ? Number(query.offset) : 0;
    const minUsers = query.minUsers ? Number(query.minUsers) : 0;
    const usersFilter =
      query.usersFilter === 'with_users' || query.usersFilter === 'empty'
        ? query.usersFilter
        : 'all';
    const control =
      query.control === 'everyone' || query.control === 'host' ? query.control : 'all';
    const sortUsers =
      query.sortUsers === 'desc' || query.sortUsers === 'asc' ? query.sortUsers : 'none';

    const result = roomManager.listActiveRooms({
      q: query.q,
      usersFilter,
      minUsers: Number.isFinite(minUsers) ? minUsers : 0,
      control,
      sortUsers,
      limit: Number.isFinite(limit) ? limit : 12,
      offset: Number.isFinite(offset) ? offset : 0,
    });

    let savedRooms: Array<{
      code: string;
      name: string;
      maxUsers: number;
      isHidden: boolean;
      createdAt: number;
    }> = [];

    try {
      await request.jwtVerify();
      if (!request.user.isGuest) {
        savedRooms = db
          .select({
            code: rooms.code,
            name: rooms.name,
            maxUsers: rooms.maxUsers,
            isHidden: rooms.isHidden,
            createdAt: rooms.createdAt,
          })
          .from(rooms)
          .where(and(eq(rooms.ownerId, request.user.sub), eq(rooms.isPersistent, true)))
          .all();
      }
    } catch {
    }

    return {
      rooms: result.items,
      total: result.total,
      hasMore: result.hasMore,
      savedRooms,
    };
  });

  app.post('/api/rooms', { preHandler: requireAuth }, async (request, reply) => {
    const body = (request.body ?? {}) as {
      name?: unknown;
      maxUsers?: unknown;
      isPersistent?: unknown;
      isHidden?: unknown;
    };

    const rawName = typeof body.name === 'string' ? body.name.trim() : '';
    const name = rawName.length >= 2 && rawName.length <= 48 ? rawName : 'Кинозал';
    const maxUsers =
      typeof body.maxUsers === 'number' && body.maxUsers >= 2 && body.maxUsers <= 50
        ? Math.floor(body.maxUsers)
        : 20;
    const isPersistent = Boolean(body.isPersistent) && !request.user.isGuest;
    const isHidden = Boolean(body.isHidden);

    if (isPersistent) {
      const existingPersistent = db
        .select({ code: rooms.code })
        .from(rooms)
        .where(and(eq(rooms.ownerId, request.user.sub), eq(rooms.isPersistent, true)))
        .get();
      if (existingPersistent) {
        return reply.code(409).send({
          error: `У вас уже есть вечная комната (${existingPersistent.code}). Можно создать только одну вечную комнату.`,
        });
      }
    }

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
        isHidden,
        maxUsers,
        createdAt: Date.now(),
      })
      .run();

    roomManager.getOrInitRoom({
      code,
      name,
      ownerId: request.user.sub,
      isPersistent,
      isHidden,
      maxUsers,
    });

    return reply.code(201).send({
      room: { code, name, maxUsers, isPersistent, isHidden },
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
        isHidden: dbRoom.isHidden,
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

  app.patch('/api/rooms/:code/settings', { preHandler: requireAuth }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const normalizedCode = code.trim().toUpperCase();
    const body = (request.body ?? {}) as {
      isPersistent?: unknown;
      isHidden?: unknown;
    };

    const dbRoom = db.select().from(rooms).where(eq(rooms.code, normalizedCode)).get();
    if (!dbRoom) {
      return reply.code(404).send({ error: 'Комната не найдена' });
    }
    if (dbRoom.ownerId !== request.user.sub) {
      return reply.code(403).send({ error: 'Изменять настройки может только владелец комнаты' });
    }

    let nextPersistent = dbRoom.isPersistent;
    if (typeof body.isPersistent === 'boolean') {
      if (body.isPersistent && request.user.isGuest) {
        return reply.code(403).send({ error: 'Гости не могут сохранять вечные комнаты' });
      }
      if (body.isPersistent) {
        const otherPersistent = db
          .select({ code: rooms.code })
          .from(rooms)
          .where(
            and(
              eq(rooms.ownerId, request.user.sub),
              eq(rooms.isPersistent, true),
              ne(rooms.code, normalizedCode)
            )
          )
          .get();
        if (otherPersistent) {
          return reply.code(409).send({
            error: `У вас уже есть вечная комната (${otherPersistent.code}). Можно иметь только одну вечную комнату.`,
          });
        }
      }
      nextPersistent = body.isPersistent;
    }

    const nextHidden = typeof body.isHidden === 'boolean' ? body.isHidden : dbRoom.isHidden;

    db.update(rooms)
      .set({ isPersistent: nextPersistent, isHidden: nextHidden })
      .where(eq(rooms.code, normalizedCode))
      .run();

    const live = roomManager.getRoom(normalizedCode);
    if (live) {
      live.isPersistent = nextPersistent;
      live.isHidden = nextHidden;
      if (nextPersistent && live.emptyTimer) {
        clearTimeout(live.emptyTimer);
        live.emptyTimer = undefined;
      }
      roomManager.broadcast(live, {
        type: 'room:settings',
        allowEveryoneControl: live.allowEveryoneControl,
        isPersistent: live.isPersistent,
        isHidden: live.isHidden,
      });
    }

    return {
      isPersistent: nextPersistent,
      isHidden: nextHidden,
    };
  });

  app.delete('/api/rooms/:code', { preHandler: requireAuth }, async (request, reply) => {
    const { code } = request.params as { code: string };
    const normalizedCode = code.trim().toUpperCase();

    const dbRoom = db.select().from(rooms).where(eq(rooms.code, normalizedCode)).get();
    if (!dbRoom) {
      return reply.code(404).send({ error: 'Комната не найдена' });
    }
    if (dbRoom.ownerId !== request.user.sub) {
      return reply.code(403).send({ error: 'Удалить комнату может только её владелец' });
    }

    db.delete(rooms).where(eq(rooms.code, normalizedCode)).run();
    return { ok: true };
  });
}

