// Author: Nazaryan Artem (@sl1dee36)
import { eq } from 'drizzle-orm';
import type { LoomaDb } from '../../db/index.js';
import { appSettings } from '../../db/schema.js';
import { hashPassword } from '../auth/password.js';

export interface PlatformSettings {
  adminUsername: string;
  adminPasswordHash: string;
  spamRepeatLimit: number;
  spamWindowSeconds: number;
  spamMuteHours: number;
  allowedDomains: string[];
  bannedWords: string[];
  wordModerationEnabled: boolean;
  wordAction: 'block' | 'mask';
  telegramBotToken: string;
  telegramAdminChatId: string;
}

const DEFAULT_BANNED_WORDS = [
  'хуй',
  'хуя',
  'пизд',
  'бляд',
  'блять',
  'ебат',
  'ёба',
  'сука',
  'мудак',
  'гандон',
  'fuck',
  'bitch',
  'asshole',
  'bastard',
  'nigger',
  'faggot',
];

const DEFAULT_ALLOWED_DOMAINS = [
  'youtube.com',
  'youtu.be',
  'kino.vin',
  'sherlockserial.com',
];

const SETTINGS_KEY = 'platform_config';

export class SettingsService {
  private cache: PlatformSettings | null = null;
  private spamTracker = new Map<
    string,
    { lastText: string; repeatCount: number; lastAt: number }
  >();

  constructor(private readonly db: LoomaDb) {}

  async getSettings(): Promise<PlatformSettings> {
    if (this.cache) return this.cache;

    const row = this.db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, SETTINGS_KEY))
      .get();

    if (row) {
      try {
        const parsed = JSON.parse(row.value) as Partial<PlatformSettings>;
        const defaults = await this.buildDefaults();
        this.cache = { ...defaults, ...parsed };
        return this.cache;
      } catch {
      }
    }

    const defaults = await this.buildDefaults();
    this.saveSettings(defaults);
    return defaults;
  }

  private async buildDefaults(): Promise<PlatformSettings> {
    return {
      adminUsername: 'admin',
      adminPasswordHash: await hashPassword('admin'),
      spamRepeatLimit: 5,
      spamWindowSeconds: 15,
      spamMuteHours: 5,
      allowedDomains: [...DEFAULT_ALLOWED_DOMAINS],
      bannedWords: [...DEFAULT_BANNED_WORDS],
      wordModerationEnabled: true,
      wordAction: 'mask',
      telegramBotToken: '',
      telegramAdminChatId: '',
    };
  }

  saveSettings(next: PlatformSettings) {
    this.cache = next;
    const serialized = JSON.stringify(next);
    this.db
      .insert(appSettings)
      .values({ key: SETTINGS_KEY, value: serialized })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: { value: serialized },
      })
      .run();
  }

  async checkMessage(
    userId: string,
    rawText: string
  ): Promise<
    | { ok: true; text: string }
    | { ok: false; reason: string; muteUntil?: number }
  > {
    const settings = await this.getSettings();
    const now = Date.now();
    const normalized = rawText.trim().toLowerCase();

    // 1. Spam check: N identical messages in a row with short delay
    const prev = this.spamTracker.get(userId);
    const windowMs = Math.max(1, settings.spamWindowSeconds) * 1000;
    let repeatCount = 1;
    if (prev && prev.lastText === normalized && now - prev.lastAt <= windowMs) {
      repeatCount = prev.repeatCount + 1;
    }
    this.spamTracker.set(userId, { lastText: normalized, repeatCount, lastAt: now });
    if (this.spamTracker.size > 2000) {
      const oldest = this.spamTracker.keys().next().value;
      if (oldest) this.spamTracker.delete(oldest);
    }

    if (repeatCount >= Math.max(2, settings.spamRepeatLimit)) {
      const muteHours = Math.max(1, settings.spamMuteHours);
      const muteUntil = now + muteHours * 3600 * 1000;
      this.spamTracker.delete(userId);
      return {
        ok: false,
        reason: `Автомодерация: отправка в чат заблокирована на ${muteHours} ч. за спам одинаковыми сообщениями.`,
        muteUntil,
      };
    }

    // 2. Banned words check (RU / EN)
    let text = rawText;
    if (settings.wordModerationEnabled && settings.bannedWords.length > 0) {
      const escaped = settings.bannedWords
        .map((w) => w.trim())
        .filter(Boolean)
        .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

      if (escaped.length > 0) {
        const regex = new RegExp(`(${escaped.join('|')})`, 'giu');
        if (regex.test(text)) {
          if (settings.wordAction === 'block') {
            return {
              ok: false,
              reason: 'Сообщение заблокировано автомодерацией (запрещённые слова).',
            };
          }
          text = text.replace(regex, (match) => '*'.repeat(Math.max(3, match.length)));
        }
      }
    }

    return { ok: true, text };
  }
}

