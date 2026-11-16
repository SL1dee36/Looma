// Author: Nazaryan Artem (@sl1dee36)
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Keyboard,
  Link2,
  ListVideo,
  MessageSquare,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Send,
  Shield,
  Trash2,
  Users,
  Crown,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { useRoomStore } from '../stores/useRoomStore';
import { AuthPanel } from '../components/AuthPanel';
import { SyncPlayer } from '../components/player/SyncPlayer';
import { ChatKeyboard } from '../components/chat/ChatKeyboard';

type SidebarTab = 'chat' | 'search' | 'queue' | 'users';

function detectTouchOrMobile(): boolean {
  if (typeof window === 'undefined') return false;
  const isCoarseOnly =
    window.matchMedia('(pointer: coarse)').matches &&
    !window.matchMedia('(pointer: fine)').matches;
  const uaDataMobile = (navigator as Navigator & { userAgentData?: { mobile?: boolean } })
    .userAgentData?.mobile;
  const mobileUa =
    Boolean(uaDataMobile) ||
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    );
  return isCoarseOnly || mobileUa;
}

function detectMobileLayout(): boolean {
  if (typeof window === 'undefined') return false;
  return detectTouchOrMobile() || window.innerWidth <= 900;
}

export function RoomPage() {
  const { code = '' } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, token, initialized } = useAuthStore();
  const room = useRoomStore();

  const [isMobile, setIsMobile] = useState(() => detectMobileLayout());
  const [sidebarOpen, setSidebarOpen] = useState(() => !detectMobileLayout());
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => {
    const saved = Number(localStorage.getItem('looma_sidebar_width'));
    return Number.isFinite(saved) && saved >= 260 && saved <= 580 ? saved : 360;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [tab, setTab] = useState<SidebarTab>('chat');
  const [copied, setCopied] = useState(false);

  const [chatText, setChatText] = useState('');
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(() => detectTouchOrMobile());
  const chatEndRef = useRef<HTMLDivElement>(null);

  const prevMobileRef = useRef(isMobile);

  useEffect(() => {
    const syncDeviceMode = () => {
      const touch = detectTouchOrMobile();
      const mobile = detectMobileLayout();
      setIsTouchDevice(touch);
      setIsMobile(mobile);
      if (prevMobileRef.current !== mobile) {
        prevMobileRef.current = mobile;
        setSidebarOpen(!mobile);
      }
    };
    syncDeviceMode();

    const mq = window.matchMedia('(pointer: coarse)');
    mq.addEventListener('change', syncDeviceMode);
    window.addEventListener('resize', syncDeviceMode);

    return () => {
      mq.removeEventListener('change', syncDeviceMode);
      window.removeEventListener('resize', syncDeviceMode);
    };
  }, []);

  const [urlInput, setUrlInput] = useState('');
  const [resolving, setResolving] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);

  useEffect(() => {
    if (!initialized || !token || !code) return;
    room.connect(code.toUpperCase(), token);
    return () => {
      room.disconnect();
    };

  }, [initialized, token, code]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [room.messages.length]);

  useEffect(() => {
    if (!isResizing) return;
    const onPointerMove = (e: PointerEvent) => {
      const next = Math.min(580, Math.max(260, window.innerWidth - e.clientX));
      setSidebarWidth(next);
    };
    const onPointerUp = () => {
      setIsResizing(false);
    };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [isResizing]);

  useEffect(() => {
    localStorage.setItem('looma_sidebar_width', String(sidebarWidth));
  }, [sidebarWidth]);

  if (!initialized) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center text-sm text-zinc-500">
        Загрузка...
      </div>
    );
  }

  if (!user || !token) {
    return (
      <div className="min-h-screen bg-[#0B0C10] flex flex-col items-center justify-center px-6">
        <AuthPanel
          title={`Вход в зал ${code.toUpperCase()}`}
          subtitle="Представьтесь, чтобы подключиться к совместному просмотру"
        />
      </div>
    );
  }

  const isHost = room.hostId === user.id;
  const canControl = isHost || room.allowEveryoneControl;

  const copyInvite = async () => {
    await navigator.clipboard.writeText(window.location.href).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const sendChatMessage = () => {
    const trimmed = chatText.trim();
    if (!trimmed) return;
    room.send({ type: 'chat:send', text: trimmed });
    setChatText('');
  };

  const handleSendChat = (e: FormEvent) => {
    e.preventDefault();
    sendChatMessage();
  };

  const handleResolveAndAdd = async (url: string, playNow = true) => {
    if (!url.trim()) return;
    setMediaError(null);
    setResolving(true);
    try {
      const { item } = await api.resolveMedia(url.trim());
      room.send({ type: 'queue:add', item, playNow });
      setUrlInput('');
    } catch (err) {
      setMediaError(err instanceof Error ? err.message : 'Не удалось загрузить видео');
    } finally {
      setResolving(false);
    }
  };

  return (
    <div className="h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col overflow-hidden">
      {/* Top Bar */}
      <header className="h-14 shrink-0 border-b border-white/8 bg-[#0B0C10]/90 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => navigate('/')}
            className="rounded-lg border border-white/8 bg-[#12141A] p-2 text-zinc-400 hover:text-white transition cursor-pointer"
            title="На главную"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-semibold text-white truncate">
                {room.name || 'Кинозал'}
              </h1>
              <button
                onClick={copyInvite}
                className="flex items-center gap-1.5 rounded-md border border-white/8 bg-[#12141A] hover:border-indigo-500/40 px-2 py-0.5 font-mono text-[11px] text-zinc-300 transition cursor-pointer"
                title="Скопировать ссылку-приглашение"
              >
                {room.code || code.toUpperCase()}
                {copied ? (
                  <Check className="h-3 w-3 text-emerald-400" />
                ) : (
                  <Copy className="h-3 w-3 text-zinc-500" />
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          {/* WS Status & Ping */}
          <div className="hidden sm:flex items-center gap-2 rounded-full border border-white/8 bg-[#12141A] px-3 py-1 text-[11px] font-mono text-zinc-400">
            <span
              className={`h-2 w-2 rounded-full ${
                room.status === 'connected'
                  ? 'bg-emerald-400'
                  : room.status === 'connecting'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-red-400'
              }`}
            />
            <span>{room.status === 'connected' ? 'LIVE' : room.status.toUpperCase()}</span>
            {room.latencyMs !== null && <span className="text-zinc-500">{room.latencyMs}ms</span>}
          </div>

          {isHost && (
            <button
              onClick={() =>
                room.send({
                  type: 'room:toggle_control',
                  allowEveryone: !room.allowEveryoneControl,
                })
              }
              className={`hidden md:flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition cursor-pointer ${
                room.allowEveryoneControl
                  ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-300'
                  : 'border-white/8 bg-[#12141A] text-zinc-400 hover:text-white'
              }`}
              title="Разрешить всем участникам управлять плеером"
            >
              <Shield className="h-3.5 w-3.5" />
              {room.allowEveryoneControl ? 'Управляют все' : 'Только хост'}
            </button>
          )}

          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="rounded-lg border border-white/8 bg-[#12141A] p-2 text-zinc-400 hover:text-white transition cursor-pointer"
            title={sidebarOpen ? 'Скрыть панель' : 'Показать панель'}
          >
            {sidebarOpen ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <div className="relative flex-1 flex min-h-0 overflow-hidden">
        {/* Player Stage */}
        <main
          className={`flex-1 min-w-0 flex flex-col items-center justify-center p-2 sm:p-4 overflow-hidden ${
            isResizing ? 'pointer-events-none select-none' : ''
          }`}
        >
          <div
            style={{ maxWidth: 'min(100%, calc((100vh - 6rem) * 16 / 9))' }}
            className="mx-auto w-full min-w-0 space-y-2"
          >
            {room.error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs text-red-300">
                {room.error}
              </div>
            )}

            <SyncPlayer
              playback={room.playback}
              canControl={canControl}
              getExpectedTime={room.getExpectedPlaybackTime}
              onPlay={(time) => room.send({ type: 'player:play', time })}
              onPause={(time) => room.send({ type: 'player:pause', time })}
              onSeek={(time) => room.send({ type: 'player:seek', time })}
              onRateChange={(rate, time) => room.send({ type: 'player:rate', rate, time })}
              onSelectStream={(streamIndex) =>
                room.send({ type: 'player:select_stream', streamIndex })
              }
            />
          </div>
        </main>

        {/* Resizable Right Sidebar (Desktop) / Translucent Overlay Drawer (Mobile) */}
        {!isMobile && sidebarOpen && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setIsResizing(true);
            }}
            title="Потяните, чтобы изменить ширину панели"
            className={`w-1.5 shrink-0 cursor-col-resize transition-colors ${
              isResizing ? 'bg-indigo-500/70' : 'bg-transparent hover:bg-indigo-500/40'
            }`}
          />
        )}

        {isMobile && (
          <div
            onClick={() => setSidebarOpen(false)}
            className={`fixed top-14 inset-x-0 bottom-0 z-30 bg-black/40 transition-opacity duration-300 ${
              sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
            }`}
          />
        )}

        <aside
          key={isMobile ? 'mobile-drawer' : 'desktop-sidebar'}
          style={
            !isMobile
              ? { width: sidebarOpen ? `${sidebarWidth}px` : '0px' }
              : undefined
          }
          className={
            isMobile
              ? `fixed top-14 bottom-0 right-0 z-40 w-[min(92vw,380px)] border-l border-white/12 bg-[#12141A]/80 backdrop-blur-xl shadow-2xl flex flex-col min-h-0 transition-transform duration-300 ease-out ${
                  sidebarOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                }`
              : `shrink-0 bg-[#12141A] flex flex-col min-h-0 overflow-hidden ${
                  isResizing ? '' : 'transition-[width,opacity] duration-300 ease-out'
                } ${
                  sidebarOpen
                    ? 'border-l border-white/8 opacity-100'
                    : 'border-l-0 opacity-0 pointer-events-none'
                }`
          }
        >
            {/* Sidebar Tabs */}
            <div className="grid grid-cols-4 border-b border-white/8 p-1.5 gap-1 shrink-0">
              {[
                { id: 'chat' as const, label: 'Чат', icon: MessageSquare },
                { id: 'search' as const, label: 'Видео', icon: Link2 },
                { id: 'queue' as const, label: `Очередь`, icon: ListVideo, count: room.queue.length },
                {
                  id: 'users' as const,
                  label: 'Люди',
                  icon: Users,
                  count: room.participants.length,
                },
              ].map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => setTab(item.id)}
                    className={`flex items-center justify-center gap-1 rounded-lg px-1.5 py-2 text-[11px] font-medium min-w-0 transition cursor-pointer ${
                      active
                        ? 'bg-[#181B22] text-white'
                        : 'text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden sm:inline truncate">{item.label}</span>
                    {item.count !== undefined && item.count > 0 && (
                      <span className="text-[10px] font-mono text-indigo-400 shrink-0">
                        {item.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Tab: Chat */}
            {tab === 'chat' && (
              <>
                <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
                  {room.messages.length === 0 && (
                    <div className="text-center text-xs text-zinc-500 mt-8">
                      Сообщений пока нет. Напишите что-нибудь!
                    </div>
                  )}
                  {(() => {
                    type ChatEntry =
                      | { kind: 'single'; msg: (typeof room.messages)[number] }
                      | {
                          kind: 'group';
                          id: string;
                          userId: string;
                          username: string;
                          isGuest?: boolean;
                          items: Array<(typeof room.messages)[number]>;
                        };

                    const entries: ChatEntry[] = [];
                    for (const m of room.messages) {
                      if (m.system || m.isBot) {
                        entries.push({ kind: 'single', msg: m });
                        continue;
                      }
                      const last = entries[entries.length - 1];
                      if (last && last.kind === 'group' && last.userId === m.userId) {
                        last.items.push(m);
                      } else {
                        entries.push({
                          kind: 'group',
                          id: m.id,
                          userId: m.userId,
                          username: m.username,
                          isGuest: m.isGuest,
                          items: [m],
                        });
                      }
                    }

                    return entries.map((entry) => {
                      if (entry.kind === 'single') {
                        const m = entry.msg;
                        if (m.system) {
                          return (
                            <div key={m.id} className="text-center text-[11px] text-zinc-500 py-0.5">
                              {m.text}
                            </div>
                          );
                        }
                        return (
                          <div
                            key={m.id}
                            className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 px-3 py-2.5 space-y-1"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-indigo-500/25 px-1.5 py-0.5 font-mono text-[10px] font-medium text-indigo-300">
                                BOT
                              </span>
                              <span className="text-[11px] font-medium text-indigo-200">
                                {m.username}
                              </span>
                            </div>
                            <p className="text-xs text-zinc-200 leading-relaxed whitespace-pre-line break-words">
                              {m.text}
                            </p>
                          </div>
                        );
                      }

                      const isMine = entry.userId === user.id;
                      const participant = room.participants.find(
                        (p) => p.userId === entry.userId
                      );
                      const isAdmin = entry.userId === room.hostId || Boolean(participant?.isHost);
                      const isRegistered =
                        entry.isGuest === false || participant?.isGuest === false;
                      const lastMsg = entry.items[entry.items.length - 1];
                      const timeStr = new Date(lastMsg.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      });

                      return (
                        <div
                          key={entry.id}
                          className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}
                        >
                          <div
                            className={`min-w-[145px] max-w-[92%] rounded-2xl px-3.5 py-2.5 space-y-1.5 ${
                              isMine
                                ? 'rounded-br-sm bg-indigo-500/22 border border-indigo-400/25 text-white'
                                : 'rounded-bl-sm bg-[#181B22] border border-white/8 text-zinc-200'
                            }`}
                          >
                            <div className="flex items-center">
                              <span
                                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-white ${
                                  isMine ? 'bg-indigo-400/25' : 'bg-white/10'
                                }`}
                              >
                                {isAdmin && <Crown className="h-3 w-3 text-white shrink-0" />}
                                {isRegistered && (
                                  <CheckCircle2 className="h-3 w-3 text-white shrink-0" />
                                )}
                                <span className="truncate max-w-[160px]">{entry.username}</span>
                              </span>
                            </div>

                            <div className="space-y-1">
                              {entry.items.map((item) => (
                                <p key={item.id} className="text-xs leading-relaxed break-words">
                                  {item.text}
                                </p>
                              ))}
                            </div>

                            <div
                              className={`text-[10px] font-mono text-right ${
                                isMine ? 'text-indigo-200/60' : 'text-zinc-500'
                              }`}
                            >
                              {timeStr}
                            </div>
                          </div>
                        </div>
                      );
                    });
                  })()}
                  <div ref={chatEndRef} />
                </div>

                <form onSubmit={handleSendChat} className="border-t border-white/8 p-2.5 flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => setKeyboardOpen((v) => !v)}
                    title="Экранная клавиатура и эмодзи"
                    className={`rounded-xl border px-2.5 py-2 transition cursor-pointer ${
                      keyboardOpen
                        ? 'border-indigo-500/40 bg-indigo-500/20 text-indigo-300'
                        : 'border-white/10 bg-[#0B0C10] text-zinc-400 hover:text-white'
                    }`}
                  >
                    <Keyboard className="h-4 w-4" />
                  </button>
                  {isTouchDevice ? (
                    <div
                      role="textbox"
                      tabIndex={0}
                      onClick={() => setKeyboardOpen(true)}
                      className="flex-1 min-w-0 rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white flex items-center overflow-hidden cursor-pointer select-none"
                    >
                      {chatText ? (
                        <span className="truncate text-white">
                          {chatText}
                          {keyboardOpen && (
                            <span className="inline-block w-0.5 h-3.5 bg-indigo-400 ml-0.5 align-middle animate-pulse" />
                          )}
                        </span>
                      ) : (
                        <span className="text-zinc-600 truncate">Написать в чат...</span>
                      )}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={chatText}
                      onChange={(e) => setChatText(e.target.value)}
                      placeholder="Написать в чат..."
                      maxLength={1000}
                      className="flex-1 min-w-0 rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                    />
                  )}
                  <button
                    type="submit"
                    disabled={!chatText.trim()}
                    className="rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 p-2 text-white transition cursor-pointer"
                  >
                    <Send className="h-4 w-4" />
                  </button>
                </form>

                {keyboardOpen && (
                  <ChatKeyboard
                    onChar={(ch) => setChatText((prev) => (prev + ch).slice(0, 1000))}
                    onBackspace={() =>
                      setChatText((prev) => Array.from(prev).slice(0, -1).join(''))
                    }
                    onSubmit={sendChatMessage}
                  />
                )}
              </>
            )}

            {/* Tab: Add Video by URL */}
            {tab === 'search' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {!canControl && (
                  <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-200">
                    Сейчас управлять видео может только хост комнаты.
                  </div>
                )}

                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Ссылка на фильм, сериал или YouTube
                    </label>
                    <p className="mt-1 text-[11px] text-zinc-500 leading-relaxed">
                      Вставьте URL страницы с фильмом (например, kino.vin или любой другой сайт),
                      ссылку на YouTube или прямой поток (.m3u8 / .mp4) — парсер сам найдёт плеер.
                    </p>
                  </div>

                  <input
                    type="text"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://... или ссылка без https"
                    disabled={!canControl || resolving}
                    className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={!canControl || resolving || !urlInput.trim()}
                      onClick={() => handleResolveAndAdd(urlInput, true)}
                      className="flex items-center justify-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-40 px-3 py-2.5 text-xs font-medium text-white transition cursor-pointer"
                    >
                      <Play className="h-3.5 w-3.5" />
                      {resolving ? 'Поиск...' : 'Смотреть'}
                    </button>
                    <button
                      type="button"
                      disabled={!canControl || resolving || !urlInput.trim()}
                      onClick={() => handleResolveAndAdd(urlInput, false)}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#181B22] hover:bg-white/10 disabled:opacity-40 px-3 py-2.5 text-xs font-medium text-zinc-200 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      В очередь
                    </button>
                  </div>
                </div>

                {mediaError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-3 text-xs text-red-300">
                    {mediaError}
                  </div>
                )}

                {room.playback?.media &&
                  (room.playback.media.prevEpisodeUrl || room.playback.media.nextEpisodeUrl) && (
                    <div className="pt-3 border-t border-white/8 space-y-2">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                        Навигация по сериям
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          disabled={!canControl || resolving || !room.playback.media.prevEpisodeUrl}
                          onClick={() =>
                            room.playback?.media?.prevEpisodeUrl &&
                            handleResolveAndAdd(room.playback.media.prevEpisodeUrl, true)
                          }
                          className="flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#0B0C10] hover:bg-white/5 disabled:opacity-35 px-2.5 py-2 text-xs text-zinc-200 transition cursor-pointer"
                        >
                          <ChevronLeft className="h-3.5 w-3.5" />
                          Пред. серия
                        </button>
                        <button
                          type="button"
                          disabled={!canControl || resolving || !room.playback.media.nextEpisodeUrl}
                          onClick={() =>
                            room.playback?.media?.nextEpisodeUrl &&
                            handleResolveAndAdd(room.playback.media.nextEpisodeUrl, true)
                          }
                          className="flex items-center justify-center gap-1 rounded-xl border border-white/10 bg-[#0B0C10] hover:bg-white/5 disabled:opacity-35 px-2.5 py-2 text-xs text-zinc-200 transition cursor-pointer"
                        >
                          След. серия
                          <ChevronRight className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                {room.playback?.media && room.playback.media.streams.length > 1 && (
                  <div className="pt-3 border-t border-white/8 space-y-2">
                    <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                      Плееры / Озвучка / Сезоны
                    </label>
                    <div className="space-y-1.5">
                      {room.playback.media.streams.map((s, idx) => {
                        const active = idx === room.playback?.media?.selectedStreamIndex;
                        return (
                          <button
                            key={s.url + idx}
                            type="button"
                            disabled={!canControl}
                            onClick={() => room.send({ type: 'player:select_stream', streamIndex: idx })}
                            className={`w-full text-left rounded-xl border px-3 py-2 text-xs transition cursor-pointer disabled:opacity-50 ${
                              active
                                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                                : 'border-white/8 bg-[#0B0C10] text-zinc-300 hover:bg-white/5'
                            }`}
                          >
                            {s.label || s.quality}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab: Queue */}
            {tab === 'queue' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
                {room.queue.length === 0 ? (
                  <div className="text-center text-xs text-zinc-500 mt-8">
                    Очередь пуста. Добавьте фильмы или ролики во вкладке «Видео».
                  </div>
                ) : (
                  room.queue.map((item, idx) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 rounded-xl border border-white/8 bg-[#0B0C10] p-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-white truncate">{item.title}</p>
                        <p className="text-[11px] text-zinc-500">
                          {item.source} • {item.addedBy}
                        </p>
                      </div>
                      {canControl && (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => room.send({ type: 'queue:play_index', index: idx })}
                            className="rounded-lg p-1.5 text-indigo-300 hover:bg-indigo-500/15 transition cursor-pointer"
                            title="Включить сейчас"
                          >
                            <Play className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => room.send({ type: 'queue:remove', itemId: item.id })}
                            className="rounded-lg p-1.5 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                            title="Удалить"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            )}

            {/* Tab: Participants */}
            {tab === 'users' && (
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {room.participants.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center justify-between rounded-xl border border-white/8 bg-[#0B0C10] px-3.5 py-2.5"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="h-2 w-2 rounded-full bg-emerald-400" />
                      <span className="text-xs font-medium text-zinc-200">{p.username}</span>
                      {p.isGuest && <span className="text-[10px] text-zinc-500">гость</span>}
                    </div>
                    {p.isHost && (
                      <span className="flex items-center gap-1 rounded-full bg-indigo-500/15 border border-indigo-400/30 px-2 py-0.5 text-[10px] text-indigo-300">
                        <Crown className="h-3 w-3" /> Хост
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </aside>
      </div>
    </div>
  );
}

