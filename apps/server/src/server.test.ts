// Author: Nazaryan Artem (@sl1dee36)
import { describe, it, after } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from './index.js';
import { computePlaybackTime } from './modules/rooms/roomManager.js';
import { UniversalPageProvider } from './modules/parser/universal.js';
import { extractYouTubeId } from './modules/parser/youtube.js';
import { createDatabase } from './db/index.js';
import { SettingsService } from './modules/admin/settingsService.js';
import { verifyEmailDomain } from './modules/support/routes.js';

describe('Room sync math', () => {
  it('computes frozen time when paused', () => {
    const t = computePlaybackTime(
      {
        media: null,
        isPlaying: false,
        baseTime: 42.5,
        updatedAt: 1000,
        playbackRate: 1.5,
      },
      10000
    );
    assert.equal(t, 42.5);
  });

  it('computes elapsed time with playbackRate when playing', () => {
    const t = computePlaybackTime(
      {
        media: null,
        isPlaying: true,
        baseTime: 10,
        updatedAt: 1000,
        playbackRate: 1.5,
      },
      5000
    );
    assert.equal(t, 16);
  });
});

describe('Auth & Rooms API', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  after(async () => {
    if (app) await app.close();
  });

  it('supports guest login, registration, room creation and lookup', async () => {
    app = await buildApp({ dbPath: ':memory:' });

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    assert.equal(health.statusCode, 200);
    assert.equal(health.json().status, 'ok');

    const guestRes = await app.inject({
      method: 'POST',
      url: '/api/auth/guest',
      payload: { username: 'CinemaGuest' },
    });
    assert.equal(guestRes.statusCode, 200);
    const guestBody = guestRes.json();
    assert.equal(guestBody.user.username, 'CinemaGuest');
    assert.equal(guestBody.user.isGuest, true);
    assert.ok(guestBody.token);

    const regRes = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { username: 'Director', password: 'supersecret123' },
    });
    assert.equal(regRes.statusCode, 201);
    const regBody = regRes.json();
    assert.equal(regBody.user.isGuest, false);

    const roomRes = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${regBody.token}` },
      payload: { name: 'Вечерний сеанс', maxUsers: 10, isPersistent: true },
    });
    assert.equal(roomRes.statusCode, 201);
    const { room } = roomRes.json();
    assert.equal(room.name, 'Вечерний сеанс');
    assert.equal(room.code.length, 6);

    const getRes = await app.inject({
      method: 'GET',
      url: `/api/rooms/${room.code}`,
    });
    assert.equal(getRes.statusCode, 200);
    assert.equal(getRes.json().room.name, 'Вечерний сеанс');

    const secondPersistentRes = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${regBody.token}` },
      payload: { name: 'Второй зал', isPersistent: true },
    });
    assert.equal(secondPersistentRes.statusCode, 409);

    const hiddenRes = await app.inject({
      method: 'POST',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${regBody.token}` },
      payload: { name: 'Приватный зал', isPersistent: false, isHidden: true },
    });
    assert.equal(hiddenRes.statusCode, 201);
    const hiddenCode = hiddenRes.json().room.code;

    const listRes = await app.inject({
      method: 'GET',
      url: '/api/rooms',
      headers: { authorization: `Bearer ${regBody.token}` },
    });
    assert.equal(listRes.statusCode, 200);
    const listBody = listRes.json();
    assert.equal(listBody.savedRooms.length, 1);
    assert.equal(
      listBody.rooms.some((r: { code: string }) => r.code === hiddenCode),
      false
    );

    const patchRes = await app.inject({
      method: 'PATCH',
      url: `/api/rooms/${room.code}/settings`,
      headers: { authorization: `Bearer ${regBody.token}` },
      payload: { isHidden: true },
    });
    assert.equal(patchRes.statusCode, 200);
    assert.equal(patchRes.json().isHidden, true);

    const adminLogin = await app.inject({
      method: 'POST',
      url: '/api/admin/login',
      payload: { username: 'admin', password: 'admin' },
    });
    assert.equal(adminLogin.statusCode, 200);
    const adminToken = adminLogin.json().token;
    assert.ok(adminToken);

    const adminUsers = await app.inject({
      method: 'GET',
      url: '/api/admin/users?q=Director',
      headers: { authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminUsers.statusCode, 200);
    assert.equal(adminUsers.json().users.length, 1);
  });
});

describe('Support email validation', () => {
  it('blocks disposable and non-existent email domains', async () => {
    const disposable = await verifyEmailDomain('spammer@mailinator.com');
    assert.equal(disposable.ok, false);

    const nonexistent = await verifyEmailDomain('user@nonexistent-domain-looma-test-12345.invalid');
    assert.equal(nonexistent.ok, false);
  });
});

describe('Chat automoderation', () => {
  it('mutes user after 5 identical messages in a row and masks banned words', async () => {
    const { db, sqlite } = createDatabase(':memory:');
    try {
      const svc = new SettingsService(db);

      const clean = await svc.checkMessage('u1', 'Привет мир fuck');
      assert.equal(clean.ok, true);
      if (clean.ok) {
        assert.equal(clean.text, 'Привет мир ****');
      }

      for (let i = 1; i <= 4; i++) {
        const res = await svc.checkMessage('u2', 'спам');
        assert.equal(res.ok, true);
      }
      const fifth = await svc.checkMessage('u2', 'спам');
      assert.equal(fifth.ok, false);
      if (!fifth.ok) {
        assert.ok(fifth.muteUntil && fifth.muteUntil > Date.now());
      }
    } finally {
      sqlite.close();
    }
  });
});

describe('Media parsers', () => {
  it('extracts YouTube IDs from standard, short and shorts URLs', () => {
    assert.equal(extractYouTubeId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeId('https://youtu.be/dQw4w9WgXcQ?t=12'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
    assert.equal(extractYouTubeId('https://example.com/video'), null);
  });

  it('extracts streams and filters ad iframes on arbitrary movie pages', async () => {
    const provider = new UniversalPageProvider();
    assert.equal(provider.canResolve('https://kino.vin/films/123.html'), true);
    assert.equal(provider.canResolve('http://127.0.0.1:8080/secret'), false);

    const movieHtml = `
      <html>
        <head><meta property="og:image" content="/uploads/poster.jpg" /></head>
        <body>
          <h1>Интерстеллар</h1>
          <a href="/1s/2-serija.html">Предыдущая серия</a>
          <a href="/1s/4-serija.html">Следующая серия</a>
          <iframe src="https://mc.yandex.ru/watch/123"></iframe>
          <script>
            var playerConfig = { file: "https://cdn.example.com/hls/1080p/index.m3u8" };
          </script>
        </body>
      </html>
    `;
    const resolved = await provider.parsePageHtml(movieHtml, 'https://kino.vin/films/123-interstellar.html');
    assert.equal(resolved.title, 'Интерстеллар');
    assert.equal(resolved.source, 'webpage');
    assert.equal(resolved.prevEpisodeUrl, 'https://kino.vin/1s/2-serija.html');
    assert.equal(resolved.nextEpisodeUrl, 'https://kino.vin/1s/4-serija.html');
    assert.equal(resolved.streams.length, 1);
    assert.equal(resolved.streams[0].type, 'hls');
    assert.equal(resolved.streams[0].quality, '1080p');
    assert.ok(resolved.streams[0].url.startsWith('/api/proxy/stream?url='));
  });
});
