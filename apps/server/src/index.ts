// Author: Nazaryan Artem (@sl1dee36)
import Fastify from 'fastify';
import cors from '@fastify/cors';
import jwt from '@fastify/jwt';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { createDatabase } from './db/index.js';
import { rooms } from './db/schema.js';
import { registerAuthRoutes } from './modules/auth/routes.js';
import { RoomManager } from './modules/rooms/roomManager.js';
import { registerRoomRoutes } from './modules/rooms/routes.js';
import { registerWsRoutes } from './modules/ws/handler.js';
import { registerMediaRoutes } from './modules/parser/routes.js';
import { registerSupportRoutes } from './modules/support/routes.js';
import { SettingsService } from './modules/admin/settingsService.js';
import { registerAdminRoutes } from './modules/admin/routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

for (const envCandidate of [
  path.resolve(__dirname, '../../../.env'),
  path.resolve(process.cwd(), '.env'),
]) {
  if (fs.existsSync(envCandidate)) {
    try {
      process.loadEnvFile?.(envCandidate);
      break;
    } catch {
    }
  }
}

const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? '0.0.0.0';
const JWT_SECRET = process.env.JWT_SECRET ?? 'looma-dev-secret-change-in-production';

export async function buildApp(options?: { dbPath?: string }) {
  const app = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
    },
  });

  const { db, sqlite } = createDatabase(options?.dbPath);
  const settingsService = new SettingsService(db);
  await settingsService.getSettings();
  const roomManager = new RoomManager({
    onRoomBurned: (code) => {
      db.delete(rooms)
        .where(and(eq(rooms.code, code), eq(rooms.isPersistent, false)))
        .run();
    },
  });

  const persistentRooms = db.select().from(rooms).where(eq(rooms.isPersistent, true)).all();
  for (const r of persistentRooms) {
    roomManager.getOrInitRoom({
      code: r.code,
      name: r.name,
      ownerId: r.ownerId,
      isPersistent: r.isPersistent,
      isHidden: r.isHidden,
      maxUsers: r.maxUsers,
    });
  }

  app.addHook('onClose', async () => {
    roomManager.dispose();
    sqlite.close();
  });

  await app.register(cors, {
    origin: true,
    credentials: true,
  });

  await app.register(jwt, {
    secret: JWT_SECRET,
  });

  await app.register(websocket);

  app.get('/api/health', async () => {
    const mem = process.memoryUsage();
    return {
      status: 'ok',
      service: 'looma',
      uptime: Math.floor(process.uptime()),
      rssMb: Math.round(mem.rss / 1024 / 1024),
    };
  });

  registerAuthRoutes(app, db);
  registerRoomRoutes(app, db, roomManager);
  registerMediaRoutes(app);
  registerSupportRoutes(app, settingsService);
  registerAdminRoutes(app, db, roomManager, settingsService);
  registerWsRoutes(app, db, roomManager, settingsService);

  const webDistPath = path.resolve(__dirname, '../../web/dist');
  if (fs.existsSync(webDistPath)) {
    await app.register(fastifyStatic, {
      root: webDistPath,
      prefix: '/',
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith('/api') || request.url.startsWith('/ws')) {
        return reply.code(404).send({ error: 'Not Found' });
      }
      return reply.sendFile('index.html');
    });
  }

  return app;
}

const isTest =
  process.argv.some((a) => a.includes('.test.')) || Boolean(process.env.NODE_TEST_CONTEXT);
if (!isTest) {
  const app = await buildApp();
  try {
    await app.listen({ port: PORT, host: HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}
