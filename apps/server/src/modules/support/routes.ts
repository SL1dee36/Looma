// Author: Nazaryan Artem (@sl1dee36)
import type { FastifyInstance } from 'fastify';
import dns from 'node:dns/promises';
import type { SettingsService } from '../admin/settingsService.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const recentRequests = new Map<string, number>();

const DISPOSABLE_DOMAINS = new Set([
  'example.com',
  'example.org',
  'example.net',
  'test.com',
  'mailinator.com',
  'tempmail.com',
  'temp-mail.org',
  '10minutemail.com',
  'guerrillamail.com',
  'yopmail.com',
  'trashmail.com',
  'dispostable.com',
  'getnada.com',
  'dropmail.me',
  'mohmal.com',
  'fakeinbox.com',
]);

export async function verifyEmailDomain(email: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const parts = email.split('@');
  if (parts.length !== 2) {
    return { ok: false, reason: 'Некорректный формат почты' };
  }
  const domain = parts[1].toLowerCase().trim();
  if (!domain || !domain.includes('.') || DISPOSABLE_DOMAINS.has(domain)) {
    return { ok: false, reason: 'Использование временной или тестовой почты запрещено' };
  }

  try {
    const mx = await Promise.race([
      dns.resolveMx(domain),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('DNS_TIMEOUT')), 3500)),
    ]);
    const validMx = Array.isArray(mx) && mx.some((r) => r.exchange && r.exchange !== '.');
    if (!validMx) {
      return { ok: false, reason: 'Указанный почтовый домен не принимает письма' };
    }
    return { ok: true };
  } catch (err) {
    const code = (err as { code?: string }).code;
    if (code === 'ENOTFOUND' || code === 'ENODATA' || code === 'ESERVFAIL' || code === 'EREFUSED') {
      return { ok: false, reason: 'Почтовый домен не существует или не принимает письма' };
    }
    if ((err as Error).message === 'DNS_TIMEOUT') {
      return { ok: false, reason: 'Не удалось проверить почтовый домен (таймаут DNS)' };
    }
    return { ok: false, reason: 'Почтовый домен не прошёл проверку' };
  }
}

async function sendToTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

export function registerSupportRoutes(app: FastifyInstance, settingsService: SettingsService) {
  app.post('/api/support/contact', async (request, reply) => {
    const settings = await settingsService.getSettings();
    const adminToken = settings.telegramBotToken?.trim();
    const adminChatId = settings.telegramAdminChatId?.trim();
    const envToken = process.env.TELEGRAM_BOT_TOKEN?.trim();
    const envChatId = process.env.TELEGRAM_ADMIN_CHAT_ID?.trim();

    if ((!adminToken || !adminChatId) && (!envToken || !envChatId)) {
      return reply.code(503).send({
        error: 'Приём обращений временно не настроен на сервере (.env или админ-панель)',
      });
    }

    const ip = request.ip || 'unknown';
    const now = Date.now();
    const lastSent = recentRequests.get(ip);
    if (lastSent && now - lastSent < RATE_LIMIT_WINDOW_MS) {
      return reply.code(429).send({
        error: 'Слишком часто. Пожалуйста, подождите минуту перед следующим обращением.',
      });
    }

    const payload = (request.body ?? {}) as {
      subject?: unknown;
      body?: unknown;
      email?: unknown;
    };

    const subject = typeof payload.subject === 'string' ? payload.subject.trim() : '';
    const body = typeof payload.body === 'string' ? payload.body.trim() : '';
    const email = typeof payload.email === 'string' ? payload.email.trim() : '';

    if (subject.length < 2 || subject.length > 120) {
      return reply.code(400).send({ error: 'Тема обращения должна быть от 2 до 120 символов' });
    }
    if (body.length < 5 || body.length > 3000) {
      return reply.code(400).send({ error: 'Текст обращения должен быть от 5 до 3000 символов' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 120) {
      return reply.code(400).send({ error: 'Укажите корректную почту для обратной связи' });
    }

    const emailCheck = await verifyEmailDomain(email);
    if (!emailCheck.ok) {
      return reply.code(400).send({ error: emailCheck.reason });
    }

    const messageText = [
      '📩 Новое обращение в Looma',
      '',
      `Тема: ${subject}`,
      `Почта: ${email}`,
      '',
      'Сообщение:',
      body,
    ].join('\n');

    let delivered = false;

    if (adminToken && adminChatId) {
      try {
        delivered = await sendToTelegram(adminToken, adminChatId, messageText);
      } catch (err) {
        request.log.warn({ err }, 'Admin Telegram token failed, falling back to .env');
      }
    }

    if (!delivered && envToken && envChatId) {
      try {
        delivered = await sendToTelegram(envToken, envChatId, messageText);
      } catch (err) {
        request.log.error({ err }, 'Fallback .env Telegram request failed');
      }
    }

    if (!delivered) {
      return reply.code(502).send({ error: 'Не удалось доставить сообщение в Telegram' });
    }

    recentRequests.set(ip, now);
    if (recentRequests.size > 500) {
      const oldest = recentRequests.keys().next().value;
      if (oldest) recentRequests.delete(oldest);
    }

    return { ok: true };
  });
}
