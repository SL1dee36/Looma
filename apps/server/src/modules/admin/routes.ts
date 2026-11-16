// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { count, desc, eq, like } from 'drizzle-orm';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { LoomaDb } from '../../db/index.js';
import { chatLogs, rooms, users } from '../../db/schema.js';
import { hashPassword, verifyPassword } from '../auth/password.js';
import type { RoomManager } from '../rooms/roomManager.js';
import type { SettingsService } from './settingsService.js';

async function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  try {
    await request.jwtVerify();
    if ((request.user as { role?: string }).role !== 'admin') {
      return reply.code(403).send({ error: 'Требуются права администратора' });
    }
  } catch {
    return reply.code(401).send({ error: 'Unauthorized' });
  }
}

export function registerAdminRoutes(
  app: FastifyInstance,
  db: LoomaDb,
  roomManager: RoomManager,
  settingsService: SettingsService
) {
  app.post('/api/admin/login', async (request, reply) => {
    const body = (request.body ?? {}) as { username?: unknown; password?: unknown };
    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';

    const settings = await settingsService.getSettings();
    if (
      username !== settings.adminUsername ||
      !(await verifyPassword(password, settings.adminPasswordHash))
    ) {
      return reply.code(401).send({ error: 'Неверный логин или пароль администратора' });
    }

    const token = app.jwt.sign(
      { sub: 'admin', username: settings.adminUsername, isGuest: false, role: 'admin' } as never,
      { expiresIn: '12h' }
    );
    return { token, username: settings.adminUsername };
  });

  app.get('/api/admin/metrics', { preHandler: requireAdmin }, async () => {
    const mem = process.memoryUsage();
    const totalMemMb = Math.round(os.totalmem() / 1024 / 1024);
    const freeMemMb = Math.round(os.freemem() / 1024 / 1024);
    const rssMb = Math.round(mem.rss / 1024 / 1024);
    const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

    const dbPath =
      process.env.DB_PATH ?? path.resolve(process.cwd(), 'data', 'looma.db');
    let dbSizeMb = 0;
    for (const suffix of ['', '-wal', '-shm']) {
      try {
        dbSizeMb += fs.statSync(dbPath + suffix).size;
      } catch {
      }
    }
    dbSizeMb = Math.round((dbSizeMb / 1024 / 1024) * 100) / 100;

    let diskTotalGb: number | null = null;
    let diskFreeGb: number | null = null;
    try {
      const stat = fs.statfsSync(process.cwd());
      const totalBytes = stat.blocks * stat.bsize;
      const freeBytes = stat.bavail * stat.bsize;
      diskTotalGb = Math.round((totalBytes / 1024 / 1024 / 1024) * 10) / 10;
      diskFreeGb = Math.round((freeBytes / 1024 / 1024 / 1024) * 10) / 10;
    } catch {
    }

    const s = await settingsService.getSettings();
    const adminToken = s.telegramBotToken?.trim();
    const adminChatId = s.telegramAdminChatId?.trim();
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const envChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

    let tg: {
      status: 'online' | 'error' | 'unconfigured';
      source: 'admin' | 'env' | 'none';
      botUsername?: string;
      error?: string;
    } = { status: 'unconfigured', source: 'none' };

    const checkTg = async (token: string) => {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { ok?: boolean; result?: { username?: string } };
      if (!data.ok) throw new Error('Telegram API error');
      return data.result?.username;
    };

    if (adminToken && adminChatId) {
      try {
        const botUsername = await checkTg(adminToken);
        tg = { status: 'online', source: 'admin', botUsername };
      } catch (err) {
        if (envToken && envChatId) {
          try {
            const botUsername = await checkTg(envToken);
            tg = { status: 'online', source: 'env', botUsername };
          } catch (fallbackErr) {
            tg = {
              status: 'error',
              source: 'env',
              error: fallbackErr instanceof Error ? fallbackErr.message : 'Ошибка',
            };
          }
        } else {
          tg = {
            status: 'error',
            source: 'admin',
            error: err instanceof Error ? err.message : 'Ошибка',
          };
        }
      }
    } else if (envToken && envChatId) {
      try {
        const botUsername = await checkTg(envToken);
        tg = { status: 'online', source: 'env', botUsername };
      } catch (err) {
        tg = {
          status: 'error',
          source: 'env',
          error: err instanceof Error ? err.message : 'Ошибка',
        };
      }
    }

    return {
      uptimeSec: Math.floor(process.uptime()),
      ram: { rssMb, heapMb, totalMemMb, freeMemMb },
      storage: { dbSizeMb, diskTotalGb, diskFreeGb },
      telegram: tg,
    };
  });

  app.get('/api/admin/users', { preHandler: requireAdmin }, async (request) => {
    const query = request.query as { q?: string; limit?: string; offset?: string };
    const q = query.q?.trim() ?? '';
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 30));
    const offset = Math.max(0, Number(query.offset) || 0);

    const whereClause = q ? like(users.username, `%${q}%`) : undefined;

    const totalRow = whereClause
      ? db.select({ total: count() }).from(users).where(whereClause).get()
      : db.select({ total: count() }).from(users).get();
    const total = totalRow?.total ?? 0;

    const baseQuery = db
      .select({
        id: users.id,
        username: users.username,
        isGuest: users.isGuest,
        lastIp: users.lastIp,
        isBanned: users.isBanned,
        chatMutedUntil: users.chatMutedUntil,
        createdAt: users.createdAt,
      })
      .from(users);

    const rows = (whereClause ? baseQuery.where(whereClause) : baseQuery)
      .orderBy(desc(users.createdAt))
      .limit(limit)
      .offset(offset)
      .all();

    return {
      users: rows,
      total,
      hasMore: offset + rows.length < total,
    };
  });

  app.get('/api/admin/users/:id/messages', { preHandler: requireAdmin }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = db
      .select()
      .from(chatLogs)
      .where(eq(chatLogs.userId, id))
      .orderBy(desc(chatLogs.createdAt))
      .limit(500)
      .all();

    return { messages: rows };
  });

  app.post(
    '/api/admin/users/:id/reset-password',
    { preHandler: requireAdmin },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const body = (request.body ?? {}) as { password?: unknown };
      const password = typeof body.password === 'string' ? body.password : '';
      if (password.length < 6 || password.length > 128) {
        return reply.code(400).send({ error: 'Новый пароль должен быть от 6 до 128 символов' });
      }

      const found = db.select().from(users).where(eq(users.id, id)).get();
      if (!found) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      if (found.isGuest) {
        return reply.code(400).send({ error: 'У гостевого аккаунта нет пароля' });
      }

      const passwordHash = await hashPassword(password);
      db.update(users).set({ passwordHash }).where(eq(users.id, id)).run();
      return { ok: true };
    }
  );

  app.patch('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const body = (request.body ?? {}) as { isBanned?: unknown; clearMute?: unknown };

    const found = db.select().from(users).where(eq(users.id, id)).get();
    if (!found) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }

    const nextBanned = typeof body.isBanned === 'boolean' ? body.isBanned : found.isBanned;
    const nextMutedUntil = body.clearMute ? null : found.chatMutedUntil;

    db.update(users)
      .set({ isBanned: nextBanned, chatMutedUntil: nextMutedUntil })
      .where(eq(users.id, id))
      .run();

    return { ok: true, isBanned: nextBanned, chatMutedUntil: nextMutedUntil };
  });

  app.delete('/api/admin/users/:id', { preHandler: requireAdmin }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const found = db.select({ id: users.id }).from(users).where(eq(users.id, id)).get();
    if (!found) {
      return reply.code(404).send({ error: 'Пользователь не найден' });
    }
    db.delete(chatLogs).where(eq(chatLogs.userId, id)).run();
    db.delete(users).where(eq(users.id, id)).run();
    return { ok: true };
  });

  app.get('/api/admin/rooms', { preHandler: requireAdmin }, async () => {
    const dbRooms = db.select().from(rooms).orderBy(desc(rooms.createdAt)).all();
    const list = dbRooms.map((r) => {
      const live = roomManager.getRoom(r.code);
      return {
        code: r.code,
        name: r.name,
        ownerId: r.ownerId,
        isPersistent: r.isPersistent,
        isHidden: r.isHidden,
        maxUsers: r.maxUsers,
        participantsCount: live ? roomManager.getParticipants(live).length : 0,
        currentTitle: live?.playback.media?.title ?? null,
        createdAt: r.createdAt,
      };
    });
    return { rooms: list };
  });

  app.delete('/api/admin/rooms/:code', { preHandler: requireAdmin }, async (request) => {
    const { code } = request.params as { code: string };
    const normalizedCode = code.trim().toUpperCase();

    const live = roomManager.getRoom(normalizedCode);
    if (live) {
      for (const conn of Array.from(live.connections)) {
        conn.socket.close(4004, 'Комната удалена администратором');
      }
      roomManager.forceDeleteRoom(normalizedCode);
    }

    db.delete(rooms).where(eq(rooms.code, normalizedCode)).run();
    return { ok: true };
  });

  app.get('/api/admin/settings', { preHandler: requireAdmin }, async () => {
    const s = await settingsService.getSettings();
    return {
      settings: {
        adminUsername: s.adminUsername,
        spamRepeatLimit: s.spamRepeatLimit,
        spamWindowSeconds: s.spamWindowSeconds,
        spamMuteHours: s.spamMuteHours,
        allowedDomains: s.allowedDomains,
        bannedWords: s.bannedWords,
        wordModerationEnabled: s.wordModerationEnabled,
        wordAction: s.wordAction,
        telegramBotToken: s.telegramBotToken,
        telegramAdminChatId: s.telegramAdminChatId,
      },
    };
  });

  app.patch('/api/admin/settings', { preHandler: requireAdmin }, async (request, reply) => {
    const current = await settingsService.getSettings();
    const body = (request.body ?? {}) as {
      adminUsername?: unknown;
      newAdminPassword?: unknown;
      spamRepeatLimit?: unknown;
      spamWindowSeconds?: unknown;
      spamMuteHours?: unknown;
      allowedDomains?: unknown;
      bannedWords?: unknown;
      wordModerationEnabled?: unknown;
      wordAction?: unknown;
      telegramBotToken?: unknown;
      telegramAdminChatId?: unknown;
    };

    const next = { ...current };

    if (typeof body.adminUsername === 'string' && body.adminUsername.trim().length >= 2) {
      next.adminUsername = body.adminUsername.trim();
    }
    if (typeof body.newAdminPassword === 'string' && body.newAdminPassword.length > 0) {
      if (body.newAdminPassword.length < 4) {
        return reply.code(400).send({ error: 'Пароль администратора должен быть от 4 символов' });
      }
      next.adminPasswordHash = await hashPassword(body.newAdminPassword);
    }
    if (typeof body.spamRepeatLimit === 'number' && body.spamRepeatLimit >= 2) {
      next.spamRepeatLimit = Math.floor(body.spamRepeatLimit);
    }
    if (typeof body.spamWindowSeconds === 'number' && body.spamWindowSeconds >= 1) {
      next.spamWindowSeconds = Math.floor(body.spamWindowSeconds);
    }
    if (typeof body.spamMuteHours === 'number' && body.spamMuteHours >= 1) {
      next.spamMuteHours = Math.floor(body.spamMuteHours);
    }
    if (Array.isArray(body.allowedDomains)) {
      next.allowedDomains = body.allowedDomains
        .map((d) => String(d).trim().toLowerCase())
        .filter(Boolean);
    }
    if (Array.isArray(body.bannedWords)) {
      next.bannedWords = body.bannedWords
        .map((w) => String(w).trim().toLowerCase())
        .filter(Boolean);
    }
    if (typeof body.wordModerationEnabled === 'boolean') {
      next.wordModerationEnabled = body.wordModerationEnabled;
    }
    if (body.wordAction === 'block' || body.wordAction === 'mask') {
      next.wordAction = body.wordAction;
    }
    if (typeof body.telegramBotToken === 'string') {
      next.telegramBotToken = body.telegramBotToken.trim();
    }
    if (typeof body.telegramAdminChatId === 'string') {
      next.telegramAdminChatId = body.telegramAdminChatId.trim();
    }

    settingsService.saveSettings(next);

    return {
      settings: {
        adminUsername: next.adminUsername,
        spamRepeatLimit: next.spamRepeatLimit,
        spamWindowSeconds: next.spamWindowSeconds,
        spamMuteHours: next.spamMuteHours,
        allowedDomains: next.allowedDomains,
        bannedWords: next.bannedWords,
        wordModerationEnabled: next.wordModerationEnabled,
        wordAction: next.wordAction,
        telegramBotToken: next.telegramBotToken,
        telegramAdminChatId: next.telegramAdminChatId,
      },
    };
  });
}

