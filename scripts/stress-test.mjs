// Author: Nazaryan Artem (@sl1dee36)
const args = Object.fromEntries(
  process.argv.slice(2).map((arg) => {
    const [k, v] = arg.replace(/^--/, '').split('=');
    return [k, v ?? 'true'];
  })
);

const BASE_URL = (args.url || process.env.STRESS_URL || 'http://127.0.0.1:3001').replace(/\/+$/, '');
const WS_BASE = BASE_URL.replace(/^http/, 'ws');
const ROOMS_COUNT = Math.max(1, Number(args.rooms || 15));
const PER_ROOM = args['per-room'] ? Math.max(1, Number(args['per-room'])) : null;
const USERS_COUNT = PER_ROOM ? ROOMS_COUNT * PER_ROOM : Math.max(1, Number(args.users || 80));
const DURATION_SEC = Math.max(3, Number(args.duration || 15));
const VIDEO_URL = args.video || 'https://www.youtube.com/watch?v=8GSKIsUMaZc';

const CHAT_PHRASES = [
  'Всем привет! Кто смотрит? 👋',
  'О, классное видео, как раз хотел глянуть 🔥',
  'Качество отличное, ничего не лагает 👍',
  'Подождите секунду, я за попкорном 🍿',
  'Хаха, вот это поворот 😂',
  'А звук у всех нормально идёт?',
  'У меня всё идеально синхронизировано 💯',
  'Давайте потом ещё что-нибудь в очередь закинем 🎬',
  'Мотани чуть назад, я отходил 😅',
  'Топчик, ставьте лайк 🚀',
  'Озвучка или оригинал лучше?',
  'Красивая картинка! ✨',
  'Кто ещё присоединился — привет! 🎉',
  'Не спойлерите только 👀',
];

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function randomPhrase(tick, idx) {
  const base = CHAT_PHRASES[(tick + idx) % CHAT_PHRASES.length];
  return `${base} [${idx}]`;
}

async function getHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error(`Healthcheck failed: ${res.status}`);
  return res.json();
}

async function createGuestAndRoom(idx) {
  const gRes = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `bot_host_${idx}` }),
  });
  if (!gRes.ok) throw new Error(`Guest failed: ${gRes.status}`);
  const { token } = await gRes.json();

  const rRes = await fetch(`${BASE_URL}/api/rooms`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name: `Кинозал #${idx}`, maxUsers: 50, isPersistent: false }),
  });
  if (!rRes.ok) throw new Error(`Room failed: ${rRes.status}`);
  const { room } = await rRes.json();
  return { code: room.code, hostToken: token };
}

async function resolveVideo(token, url) {
  const res = await fetch(`${BASE_URL}/api/media/resolve`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Resolve failed: ${res.status}`);
  const { item } = await res.json();
  return item;
}

async function createGuest(idx) {
  const res = await fetch(`${BASE_URL}/api/auth/guest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: `bot_user_${idx}` }),
  });
  if (!res.ok) throw new Error(`Guest failed: ${res.status}`);
  const { token } = await res.json();
  return token;
}

async function main() {
  console.log(`\n🚀 Looma Realistic Stress Test`);
  console.log(
    `Target: ${BASE_URL} | Rooms: ${ROOMS_COUNT} | WS Clients: ${USERS_COUNT} | Duration: ${DURATION_SEC}s`
  );
  console.log(`Video: ${VIDEO_URL}\n`);

  const healthBefore = await getHealth();
  console.log(`RAM before: ${healthBefore.rssMb} MB`);

  const stats = {
    httpOk: 0,
    httpErr: 0,
    wsConnected: 0,
    wsErrors: 0,
    wsSent: 0,
    wsReceived: 0,
    mediaResolved: 0,
    playerActions: 0,
    chatSent: 0,
    rtts: [],
  };

  console.log('Creating rooms...');
  const rooms = [];
  for (let start = 0; start < ROOMS_COUNT; start += 25) {
    const batch = Array.from(
      { length: Math.min(25, ROOMS_COUNT - start) },
      (_, j) => createGuestAndRoom(start + j + 1)
    );
    rooms.push(...(await Promise.all(batch)));
  }

  console.log('Resolving video via /api/media/resolve...');
  let resolvedItem = null;
  try {
    resolvedItem = await resolveVideo(rooms[0].hostToken, VIDEO_URL);
    stats.mediaResolved++;
    console.log(`Resolved media: "${resolvedItem.title}" (${resolvedItem.source})`);
  } catch (err) {
    console.warn('Media resolve failed, using fallback media item:', err.message);
    resolvedItem = {
      id: 'fallback-yt',
      title: 'Stress Test Video',
      source: 'youtube',
      sourceId: '8GSKIsUMaZc',
      streams: [{ quality: 'Auto', url: '8GSKIsUMaZc', type: 'youtube' }],
      selectedStreamIndex: 0,
      addedBy: 'bot_host_1',
    };
  }

  console.log('Connecting WebSocket clients...');
  const clients = [];

  for (let start = 0; start < USERS_COUNT; start += 30) {
    const batch = [];
    const end = Math.min(USERS_COUNT, start + 30);
    for (let i = start; i < end; i++) {
      const room = rooms[i % rooms.length];
      const isHost = i < rooms.length;
      batch.push(
        (async () => {
          const token = isHost ? room.hostToken : await createGuest(i + 1);
          const ws = new WebSocket(
            `${WS_BASE}/ws/rooms/${room.code}?token=${encodeURIComponent(token)}`
          );

          await new Promise((resolve) => {
            const timer = setTimeout(() => {
              stats.wsErrors++;
              resolve();
            }, 10000);

            ws.addEventListener('open', () => {
              clearTimeout(timer);
              stats.wsConnected++;
              resolve();
            });

            ws.addEventListener('error', () => {
              clearTimeout(timer);
              stats.wsErrors++;
              resolve();
            });

            ws.addEventListener('message', (ev) => {
              stats.wsReceived++;
              try {
                const msg = JSON.parse(ev.data);
                if (msg.type === 'pong' && typeof msg.clientTime === 'number') {
                  stats.rtts.push(Date.now() - msg.clientTime);
                }
              } catch {
              }
            });
          });

          clients.push({ ws, isHost, idx: i });
        })()
      );
    }
    await Promise.all(batch);
  }
  console.log(`Connected WS: ${stats.wsConnected}/${USERS_COUNT} (errors: ${stats.wsErrors})`);

  // Hosts immediately start playing the video and add a backup item to the queue
  for (const c of clients) {
    if (!c.isHost || c.ws.readyState !== WebSocket.OPEN) continue;
    const mainItem = { ...resolvedItem, id: `main-${c.idx}-${Date.now()}` };
    const queuedItem = { ...resolvedItem, id: `queue-${c.idx}-${Date.now()}` };

    c.ws.send(JSON.stringify({ type: 'queue:add', item: mainItem, playNow: true }));
    c.ws.send(JSON.stringify({ type: 'queue:add', item: queuedItem, playNow: false }));
    stats.wsSent += 2;
    stats.playerActions += 2;
  }

  console.log(`Simulating chat, playback, seeking and queue actions for ${DURATION_SEC}s...`);

  let tick = 0;
  const loadInterval = setInterval(() => {
    tick++;
    for (const c of clients) {
      if (c.ws.readyState !== WebSocket.OPEN) continue;

      c.ws.send(JSON.stringify({ type: 'ping', clientTime: Date.now() }));
      stats.wsSent++;

      if (c.isHost) {
        const actionRoll = (tick + c.idx) % 5;
        if (actionRoll === 0) {
          c.ws.send(JSON.stringify({ type: 'player:seek', time: tick * 4.5 }));
          stats.wsSent++;
          stats.playerActions++;
        } else if (actionRoll === 1) {
          c.ws.send(JSON.stringify({ type: 'player:pause', time: tick * 4.5 }));
          stats.wsSent++;
          stats.playerActions++;
        } else if (actionRoll === 2) {
          c.ws.send(JSON.stringify({ type: 'player:play', time: tick * 4.5 }));
          stats.wsSent++;
          stats.playerActions++;
        } else if (actionRoll === 3 && tick % 4 === 0) {
          const extraItem = { ...resolvedItem, id: `extra-${c.idx}-${tick}` };
          c.ws.send(JSON.stringify({ type: 'queue:add', item: extraItem, playNow: false }));
          c.ws.send(JSON.stringify({ type: 'queue:play_index', index: 0 }));
          stats.wsSent += 2;
          stats.playerActions += 2;
        }
      }

      if ((c.idx + tick) % 3 === 0) {
        c.ws.send(
          JSON.stringify({
            type: 'chat:send',
            text: randomPhrase(tick, c.idx),
          })
        );
        stats.wsSent++;
        stats.chatSent++;
      }
    }

    fetch(`${BASE_URL}/api/rooms?limit=12&offset=0`)
      .then((r) => (r.ok ? stats.httpOk++ : stats.httpErr++))
      .catch(() => stats.httpErr++);
  }, 1000);

  await new Promise((r) => setTimeout(r, DURATION_SEC * 1000));
  clearInterval(loadInterval);

  for (const c of clients) {
    try {
      c.ws.close(1000, 'Stress test complete');
    } catch {
    }
  }

  await new Promise((r) => setTimeout(r, 500));
  const healthAfter = await getHealth();

  stats.rtts.sort((a, b) => a - b);
  const avgRtt =
    stats.rtts.length > 0
      ? Math.round(stats.rtts.reduce((a, b) => a + b, 0) / stats.rtts.length)
      : 0;
  const p95Rtt = percentile(stats.rtts, 95);
  const maxRtt = stats.rtts[stats.rtts.length - 1] ?? 0;

  console.log('\n📊 Stress Test Report');
  console.log('----------------------------------------');
  console.log(`WS Connected      : ${stats.wsConnected}/${USERS_COUNT} (errors: ${stats.wsErrors})`);
  console.log(`Media Resolved    : ${stats.mediaResolved}`);
  console.log(`Player Actions    : ${stats.playerActions} (play/pause/seek/queue)`);
  console.log(`Chat Messages     : ${stats.chatSent}`);
  console.log(`WS Sent / Recv    : ${stats.wsSent} / ${stats.wsReceived}`);
  console.log(`HTTP Poll OK/Err  : ${stats.httpOk} / ${stats.httpErr}`);
  console.log(`WS Ping RTT       : avg ${avgRtt}ms | p95 ${p95Rtt}ms | max ${maxRtt}ms`);
  console.log(`Server RAM (RSS)  : ${healthBefore.rssMb} MB -> ${healthAfter.rssMb} MB`);
  console.log('----------------------------------------\n');
}

main().catch((err) => {
  console.error('Stress test failed:', err);
  process.exit(1);
});
