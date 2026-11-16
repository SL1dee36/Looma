// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { and, eq } from 'drizzle-orm';
import crypto from 'node:crypto';
import type { UserDTO } from '@looma/shared';
import type { LoomaDb } from '../../db/index.js';
import { users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from './password.js';

export interface JwtPayload {
  sub: string;
  username: string;
  isGuest: boolean;
}

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

function normalizeUsername(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (trimmed.length < 2 || trimmed.length > 24) return null;
  return trimmed;
}

export async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function registerAuthRoutes(app: FastifyInstance, db: LoomaDb) {
  app.post('/api/auth/guest', async (request, reply) => {
    const body = (request.body ?? {}) as { username?: unknown };
    const username = normalizeUsername(body.username);
    if (!username) {
      return reply.code(400).send({ error: 'Никнейм должен быть от 2 до 24 символов' });
    }

    const id = `gst_${crypto.randomUUID()}`;
    const now = Date.now();

    db.insert(users)
      .values({
        id,
        username,
        passwordHash: null,
        isGuest: true,
        lastIp: request.ip,
        createdAt: now,
      })
      .run();

    const user: UserDTO = { id, username, isGuest: true };
    const token = app.jwt.sign({ sub: id, username, isGuest: true }, { expiresIn: '14d' });
    return { token, user };
  });

  app.post('/api/auth/register', async (request, reply) => {
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
    const username = normalizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username) {
      return reply.code(400).send({ error: 'Никнейм должен быть от 2 до 24 символов' });
    }
    if (password.length < 6 || password.length > 128) {
      return reply.code(400).send({ error: 'Пароль должен быть от 6 до 128 символов' });
    }

    const existing = db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.username, username), eq(users.isGuest, false)))
      .get();

    if (existing) {
      return reply.code(409).send({ error: 'Этот никнейм уже занят' });
    }

    const id = `usr_${crypto.randomUUID()}`;
    const passwordHash = await hashPassword(password);

    db.insert(users)
      .values({
        id,
        username,
        passwordHash,
        isGuest: false,
        lastIp: request.ip,
        createdAt: Date.now(),
      })
      .run();

    const user: UserDTO = { id, username, isGuest: false };
    const token = app.jwt.sign({ sub: id, username, isGuest: false }, { expiresIn: '30d' });
    return reply.code(201).send({ token, user });
  });

  app.post('/api/auth/login', async (request, reply) => {
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
    const username = normalizeUsername(body.username);
    const password = typeof body.password === 'string' ? body.password : '';

    if (!username || !password) {
      return reply.code(400).send({ error: 'Введите никнейм и пароль' });
    }

    const found = db
      .select()
      .from(users)
      .where(and(eq(users.username, username), eq(users.isGuest, false)))
      .get();

    if (!found || !found.passwordHash || !(await verifyPassword(password, found.passwordHash))) {
      return reply.code(401).send({ error: 'Неверный никнейм или пароль' });
    }
    if (found.isBanned) {
      return reply.code(403).send({ error: 'Аккаунт заблокирован администратором' });
    }

    db.update(users).set({ lastIp: request.ip }).where(eq(users.id, found.id)).run();

    const user: UserDTO = { id: found.id, username: found.username, isGuest: false };
    const token = app.jwt.sign(
      { sub: found.id, username: found.username, isGuest: false },
      { expiresIn: '30d' }
    );
    return { token, user };
  });

  app.get('/api/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const found = db.select().from(users).where(eq(users.id, request.user.sub)).get();
    if (!found) {
      return reply.code(401).send({ error: 'Сессия недействительна' });
    }
    if (found.isBanned) {
      return reply.code(403).send({ error: 'Аккаунт заблокирован администратором' });
    }
    const user: UserDTO = {
      id: found.id,
      username: found.username,
      isGuest: found.isGuest,
    };
    return { user };
  });
}

