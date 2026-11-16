// Author: Nazaryan Artem (@sl1dee36)
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Ban,
  Bot,
  CheckCircle2,
  Cpu,
  EyeOff,
  Film,
  HardDrive,
  KeyRound,
  Loader2,
  LogOut,
  MessageSquare,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldAlert,
  Trash2,
  Tv,
  Users,
  X,
} from 'lucide-react';

function ActionTip({
  label,
  onClick,
  className = '',
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group/tip">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={className}
      >
        {children}
      </button>
      <div className="pointer-events-none absolute bottom-[calc(100%+6px)] right-0 z-50 whitespace-nowrap rounded-lg border border-white/12 bg-[#0B0C10]/95 px-2.5 py-1 text-[11px] font-medium text-zinc-100 shadow-xl opacity-0 transition-opacity duration-150 group-hover/tip:opacity-100">
        {label}
      </div>
    </div>
  );
}

const ADMIN_TOKEN_KEY = 'looma_admin_token';

async function adminReq<T>(path: string, init?: RequestInit): Promise<T> {
  const token = localStorage.getItem(ADMIN_TOKEN_KEY);
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) headers.set('Authorization', `Bearer ${token}`);
  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
  }
  return data as T;
}

interface AdminUser {
  id: string;
  username: string;
  isGuest: boolean;
  lastIp: string | null;
  isBanned: boolean;
  chatMutedUntil: number | null;
  createdAt: number;
}

interface AdminRoom {
  code: string;
  name: string;
  ownerId: string;
  isPersistent: boolean;
  isHidden: boolean;
  maxUsers: number;
  participantsCount: number;
  currentTitle: string | null;
  createdAt: number;
}

interface AdminSettings {
  adminUsername: string;
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

interface UserChatLog {
  id: string;
  roomCode: string;
  text: string;
  createdAt: number;
}

interface AdminMetrics {
  uptimeSec: number;
  ram: {
    rssMb: number;
    heapMb: number;
    totalMemMb: number;
    freeMemMb: number;
  };
  storage: {
    dbSizeMb: number;
    diskTotalGb: number | null;
    diskFreeGb: number | null;
  };
  telegram: {
    status: 'online' | 'error' | 'unconfigured';
    source: 'admin' | 'env' | 'none';
    botUsername?: string;
    error?: string;
  };
}

export function AdminPage() {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(ADMIN_TOKEN_KEY));
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [tab, setTab] = useState<'users' | 'rooms' | 'moderation' | 'system'>('users');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Users
  const [userSearch, setUserSearch] = useState('');
  const [usersList, setUsersList] = useState<AdminUser[]>([]);
  const [usersTotal, setUsersTotal] = useState(0);
  const [usersHasMore, setUsersHasMore] = useState(false);
  const [loadingMoreUsers, setLoadingMoreUsers] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userMessages, setUserMessages] = useState<UserChatLog[] | null>(null);
  const [messagesTarget, setMessagesTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);
  const [newUserPassword, setNewUserPassword] = useState('');
  const usersScrollRef = useRef<HTMLDivElement>(null);
  const usersSentinelRef = useRef<HTMLDivElement>(null);

  // Rooms
  const [roomsList, setRoomsList] = useState<AdminRoom[]>([]);

  // Settings & Metrics
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [domainsText, setDomainsText] = useState('');
  const [wordsText, setWordsText] = useState('');
  const [newAdminPassword, setNewAdminPassword] = useState('');

  const loadMetrics = useCallback(async () => {
    if (!token) return;
    try {
      const m = await adminReq<AdminMetrics>('/api/admin/metrics');
      setMetrics(m);
    } catch {
    }
  }, [token]);

  const loadUsers = useCallback(
    async (offset: number, append: boolean) => {
      if (!token) return;
      if (append) setLoadingMoreUsers(true);
      try {
        const uRes = await adminReq<{ users: AdminUser[]; total: number; hasMore: boolean }>(
          `/api/admin/users?q=${encodeURIComponent(userSearch)}&limit=30&offset=${offset}`
        );
        setUsersList((prev) => (append ? [...prev, ...uRes.users] : uRes.users));
        setUsersTotal(uRes.total);
        setUsersHasMore(uRes.hasMore);
      } catch (err) {
        if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
          localStorage.removeItem(ADMIN_TOKEN_KEY);
          setToken(null);
        }
      } finally {
        setLoadingMoreUsers(false);
      }
    },
    [token, userSearch]
  );

  const loadAll = useCallback(async () => {
    if (!token) return;
    try {
      const [, rRes, sRes] = await Promise.all([
        loadUsers(0, false),
        adminReq<{ rooms: AdminRoom[] }>('/api/admin/rooms'),
        adminReq<{ settings: AdminSettings }>('/api/admin/settings'),
        loadMetrics(),
      ]);
      setRoomsList(rRes.rooms);
      setSettings(sRes.settings);
      setDomainsText(sRes.settings.allowedDomains.join('\n'));
      setWordsText(sRes.settings.bannedWords.join('\n'));
    } catch (err) {
      if (err instanceof Error && (err.message.includes('401') || err.message.includes('Unauthorized'))) {
        localStorage.removeItem(ADMIN_TOKEN_KEY);
        setToken(null);
      }
    }
  }, [token, loadUsers, loadMetrics]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (!token) return;
    const id = window.setInterval(loadMetrics, 15_000);
    return () => window.clearInterval(id);
  }, [token, loadMetrics]);

  useEffect(() => {
    const el = usersSentinelRef.current;
    const root = usersScrollRef.current;
    if (!el || !root || !usersHasMore || loadingMoreUsers || tab !== 'users') return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadUsers(usersList.length, true);
        }
      },
      { root, rootMargin: '150px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [usersHasMore, loadingMoreUsers, usersList.length, tab, loadUsers]);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await adminReq<{ token: string }>('/api/admin/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUser, password: loginPass }),
      });
      localStorage.setItem(ADMIN_TOKEN_KEY, res.token);
      setToken(res.token);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Ошибка входа');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setToken(null);
  };

  const notify = (msg: string) => {
    setErrorMsg(null);
    setStatusMsg(msg);
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const openUserMessages = async (u: AdminUser) => {
    setMessagesTarget(u);
    try {
      const res = await adminReq<{ messages: UserChatLog[] }>(`/api/admin/users/${u.id}/messages`);
      setUserMessages(res.messages);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка загрузки сообщений');
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await adminReq(`/api/admin/users/${resetTarget.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: newUserPassword }),
      });
      setResetTarget(null);
      setNewUserPassword('');
      notify(`Пароль для ${resetTarget.username} обновлён`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сброса пароля');
    }
  };

  const toggleBan = async (u: AdminUser) => {
    try {
      await adminReq(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isBanned: !u.isBanned }),
      });
      loadAll();
      notify(u.isBanned ? `Пользователь ${u.username} разблокирован` : `Пользователь ${u.username} заблокирован`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const clearMute = async (u: AdminUser) => {
    try {
      await adminReq(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ clearMute: true }),
      });
      loadAll();
      notify(`Мут снят для ${u.username}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка');
    }
  };

  const deleteUser = async (u: AdminUser) => {
    try {
      await adminReq(`/api/admin/users/${u.id}`, { method: 'DELETE' });
      if (selectedUserId === u.id) setSelectedUserId(null);
      loadAll();
      notify(`Пользователь ${u.username} удалён`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка удаления');
    }
  };

  const deleteRoom = async (code: string) => {
    try {
      await adminReq(`/api/admin/rooms/${code}`, { method: 'DELETE' });
      loadAll();
      notify(`Зал ${code} удалён`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка удаления зала');
    }
  };

  const saveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setErrorMsg(null);
    try {
      const payload = {
        ...settings,
        allowedDomains: domainsText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        bannedWords: wordsText
          .split(/[\n,]+/)
          .map((s) => s.trim())
          .filter(Boolean),
        ...(newAdminPassword ? { newAdminPassword } : {}),
      };
      const res = await adminReq<{ settings: AdminSettings }>('/api/admin/settings', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      setSettings(res.settings);
      setNewAdminPassword('');
      notify('Настройки сохранены');
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Ошибка сохранения');
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col">
        <header className="border-b border-white/8 bg-[#0B0C10]/80">
          <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
            <Link to="/" className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300">
                <Film className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold tracking-tight">Looma Admin</span>
            </Link>
          </div>
        </header>

        <main className="flex-1 flex justify-center items-start pt-16 px-6">
          <form
            onSubmit={handleLogin}
            className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#12141A] p-6 shadow-2xl space-y-4"
          >
            <h1 className="text-base font-semibold text-white text-center">Панель администратора</h1>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Логин</label>
              <input
                type="text"
                required
                autoComplete="username"
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="admin"
                className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400 mb-1">Пароль</label>
              <input
                type="password"
                required
                autoComplete="current-password"
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="•••••"
                className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2 text-sm text-white outline-none focus:border-indigo-500/60"
              />
            </div>
            {loginError && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300">
                {loginError}
              </div>
            )}
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 py-2.5 text-sm font-medium text-white transition cursor-pointer"
            >
              Войти
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col overflow-hidden">
      <header className="shrink-0 z-30 border-b border-white/8 bg-[#0B0C10]/90 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link to="/" className="flex items-center gap-2.5 hover:opacity-90">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300">
                <Film className="h-4 w-4" />
              </div>
              <span className="text-base font-semibold tracking-tight">Looma Admin</span>
            </Link>
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-[#12141A] px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition cursor-pointer"
          >
            <LogOut className="h-3.5 w-3.5" />
            Выйти
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 mx-auto w-full max-w-6xl px-6 pt-5 pb-4 flex flex-col gap-4 overflow-hidden">
        {metrics && (
          <div className="shrink-0 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-white/8 bg-[#12141A] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300">
                  <Cpu className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-400">Оперативная память (RAM)</div>
                  <div className="font-mono text-xs font-medium text-white truncate">
                    Looma: {metrics.ram.rssMb} MB{' '}
                    <span className="text-zinc-500">
                      (сервер: {metrics.ram.totalMemMb - metrics.ram.freeMemMb}/{metrics.ram.totalMemMb} MB)
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-500/15 text-sky-300">
                  <HardDrive className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-400">Постоянная память и БД</div>
                  <div className="font-mono text-xs font-medium text-white truncate">
                    БД: {metrics.storage.dbSizeMb} MB
                    {metrics.storage.diskFreeGb !== null && metrics.storage.diskTotalGb !== null && (
                      <span className="text-zinc-500">
                        {' '}
                        • свободно {metrics.storage.diskFreeGb}/{metrics.storage.diskTotalGb} GB
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-xl border border-white/8 bg-[#12141A] px-4 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                    metrics.telegram.status === 'online'
                      ? 'bg-emerald-500/15 text-emerald-300'
                      : metrics.telegram.status === 'error'
                        ? 'bg-red-500/15 text-red-300'
                        : 'bg-amber-500/15 text-amber-300'
                  }`}
                >
                  <Bot className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-zinc-400">Telegram-бот</div>
                  <div className="text-xs font-medium text-white truncate">
                    {metrics.telegram.status === 'online' ? (
                      <span className="text-emerald-300">
                        Online {metrics.telegram.botUsername ? `@${metrics.telegram.botUsername}` : ''}{' '}
                        <span className="text-zinc-500 font-normal">({metrics.telegram.source})</span>
                      </span>
                    ) : metrics.telegram.status === 'error' ? (
                      <span className="text-red-300">Ошибка ({metrics.telegram.error})</span>
                    ) : (
                      <span className="text-amber-300">Не настроен</span>
                    )}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={loadMetrics}
                title="Обновить метрики"
                className="rounded-lg p-1.5 text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer"
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        <div className="shrink-0 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-2">
            {[
              { id: 'users' as const, label: `Пользователи (${usersTotal})`, icon: Users },
              { id: 'rooms' as const, label: `Залы (${roomsList.length})`, icon: Tv },
              { id: 'moderation' as const, label: 'Модерация и ссылки', icon: ShieldAlert },
              { id: 'system' as const, label: 'Админ и Telegram', icon: Settings },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition cursor-pointer ${
                    tab === item.id
                      ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                      : 'border-white/8 bg-[#12141A] text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </button>
              );
            })}
          </div>

          {statusMsg && (
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-1.5 text-xs text-emerald-300">
              {statusMsg}
            </div>
          )}
          {errorMsg && (
            <div className="rounded-xl border border-red-500/25 bg-red-500/10 px-3 py-1.5 text-xs text-red-300">
              {errorMsg}
            </div>
          )}
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="flex-1 min-h-0 flex flex-col gap-4">
            <div className="shrink-0 flex items-center justify-between gap-3 flex-wrap">
              <div className="relative w-full max-w-md">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Поиск пользователя по имени..."
                  className="w-full rounded-xl border border-white/10 bg-[#12141A] pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                />
              </div>
              <span className="text-xs text-zinc-500 font-mono">
                Показано {usersList.length} из {usersTotal}
              </span>
            </div>

            <div className="flex-1 min-h-0 rounded-2xl border border-white/10 bg-[#12141A] flex flex-col overflow-hidden">
              <div ref={usersScrollRef} className="flex-1 min-h-0 overflow-y-auto overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 z-20 border-b border-white/8 text-[11px] uppercase tracking-wider text-zinc-500 bg-[#0E1015]">
                    <tr>
                      <th className="px-4 py-3">Пользователь</th>
                      <th className="px-4 py-3">IP-адрес</th>
                      <th className="px-4 py-3">Местное время</th>
                      <th className="px-4 py-3">Статус</th>
                      <th className="px-4 py-3 text-right">Действия</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/6">
                    {usersList.map((u) => {
                      const isSelected = selectedUserId === u.id;
                      const isMuted = Boolean(u.chatMutedUntil && u.chatMutedUntil > Date.now());
                      return (
                        <tr
                          key={u.id}
                          onClick={() => setSelectedUserId(u.id)}
                          className={`transition cursor-pointer ${
                            isSelected ? 'bg-indigo-500/10' : 'hover:bg-white/3'
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 font-medium text-white">
                              {!u.isGuest && <CheckCircle2 className="h-3.5 w-3.5 text-indigo-300" />}
                              <span>{u.username}</span>
                              <span className="text-[10px] text-zinc-500">
                                {u.isGuest ? 'гость' : 'аккаунт'}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-300">
                            {u.lastIp || '—'}
                          </td>
                          <td className="px-4 py-3 font-mono text-zinc-400">
                            {new Date(u.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            {u.isBanned ? (
                              <span className="rounded-full bg-red-500/20 px-2 py-0.5 text-[10px] text-red-300">
                                Заблокирован
                              </span>
                            ) : isMuted ? (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-300">
                                Мут до {new Date(u.chatMutedUntil!).toLocaleTimeString()}
                              </span>
                            ) : (
                              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-300">
                                Активен
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div
                              className="flex items-center justify-end gap-1.5"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <ActionTip
                                label="Прочитать все сообщения"
                                onClick={() => openUserMessages(u)}
                                className="rounded-lg border border-white/8 bg-[#0B0C10] p-1.5 text-zinc-300 hover:text-white cursor-pointer"
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                              </ActionTip>

                              {!u.isGuest && (
                                <ActionTip
                                  label="Сбросить пароль"
                                  onClick={() => {
                                    setResetTarget(u);
                                    setNewUserPassword('');
                                  }}
                                  className="rounded-lg border border-white/8 bg-[#0B0C10] p-1.5 text-zinc-300 hover:text-white cursor-pointer"
                                >
                                  <KeyRound className="h-3.5 w-3.5" />
                                </ActionTip>
                              )}

                              {isMuted && (
                                <ActionTip
                                  label="Снять мут чата"
                                  onClick={() => clearMute(u)}
                                  className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-200 cursor-pointer"
                                >
                                  Размут
                                </ActionTip>
                              )}

                              <ActionTip
                                label={u.isBanned ? 'Разблокировать пользователя' : 'Заблокировать пользователя'}
                                onClick={() => toggleBan(u)}
                                className={`rounded-lg border p-1.5 cursor-pointer ${
                                  u.isBanned
                                    ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                                    : 'border-white/8 bg-[#0B0C10] text-zinc-300 hover:text-amber-300'
                                }`}
                              >
                                <Ban className="h-3.5 w-3.5" />
                              </ActionTip>

                              <ActionTip
                                label="Удалить пользователя"
                                onClick={() => deleteUser(u)}
                                className="rounded-lg border border-white/8 bg-[#0B0C10] p-1.5 text-zinc-400 hover:text-red-400 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </ActionTip>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                <div ref={usersSentinelRef} className="h-2" />

                {usersHasMore && (
                  <div className="flex justify-center py-3 border-t border-white/6">
                    <button
                      type="button"
                      disabled={loadingMoreUsers}
                      onClick={() => loadUsers(usersList.length, true)}
                      className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0B0C10] hover:bg-white/5 px-4 py-2 text-xs text-zinc-300 transition cursor-pointer"
                    >
                      {loadingMoreUsers ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Загрузка...
                        </>
                      ) : (
                        `Загрузить ещё (${usersList.length} из ${usersTotal})`
                      )}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Rooms Tab */}
        {tab === 'rooms' && (
          <div className="flex-1 min-h-0 overflow-y-auto pr-1">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {roomsList.map((r) => (
              <div
                key={r.code}
                className="rounded-xl border border-white/8 bg-[#12141A] p-4 flex flex-col justify-between gap-3"
              >
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-white truncate flex items-center gap-1.5">
                      {r.name}
                      {r.isHidden && <EyeOff className="h-3.5 w-3.5 text-zinc-400" />}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-400 bg-[#0B0C10] px-2 py-0.5 rounded border border-white/6">
                      {r.code}
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400 truncate">
                    {r.currentTitle || 'Ожидание видео'}
                  </div>
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-white/6 text-[11px] text-zinc-400">
                  <span>
                    {r.isPersistent ? 'Вечная' : 'Временная'} • {r.participantsCount}/{r.maxUsers}
                  </span>
                  <button
                    onClick={() => deleteRoom(r.code)}
                    className="flex items-center gap-1 rounded-lg border border-red-500/20 bg-red-500/10 hover:bg-red-500/20 px-2.5 py-1 text-red-300 transition cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Удалить
                  </button>
                </div>
              </div>
            ))}
            </div>
          </div>
        )}

        {/* Moderation & Links Tab */}
        {tab === 'moderation' && settings && (
          <form onSubmit={saveSettings} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-[#12141A] p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">Анти-спам чата</h2>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Повторов подряд</label>
                    <input
                      type="number"
                      min={2}
                      max={20}
                      value={settings.spamRepeatLimit}
                      onChange={(e) =>
                        setSettings({ ...settings, spamRepeatLimit: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Окно (сек)</label>
                    <input
                      type="number"
                      min={1}
                      max={300}
                      value={settings.spamWindowSeconds}
                      onChange={(e) =>
                        setSettings({ ...settings, spamWindowSeconds: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">Мут (часов)</label>
                    <input
                      type="number"
                      min={1}
                      max={720}
                      value={settings.spamMuteHours}
                      onChange={(e) =>
                        setSettings({ ...settings, spamMuteHours: Number(e.target.value) })
                      }
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-white/8 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-zinc-200">
                      Автомодерация слов (RU / EN)
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={settings.wordModerationEnabled}
                      data-checked={settings.wordModerationEnabled ? 'true' : 'false'}
                      onClick={() =>
                        setSettings({
                          ...settings,
                          wordModerationEnabled: !settings.wordModerationEnabled,
                        })
                      }
                      className="looma-switch"
                    >
                      <span className="looma-switch-thumb" />
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {(['mask', 'block'] as const).map((act) => (
                      <button
                        key={act}
                        type="button"
                        onClick={() => setSettings({ ...settings, wordAction: act })}
                        className={`flex-1 rounded-xl border py-2 text-xs transition cursor-pointer ${
                          settings.wordAction === act
                            ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                            : 'border-white/8 bg-[#0B0C10] text-zinc-400'
                        }`}
                      >
                        {act === 'mask' ? 'Заменять на ***' : 'Блокировать'}
                      </button>
                    ))}
                  </div>

                  <div>
                    <label className="block text-[11px] text-zinc-400 mb-1">
                      Запрещённые слова (по одному на строке или через запятую)
                    </label>
                    <textarea
                      rows={6}
                      value={wordsText}
                      onChange={(e) => setWordsText(e.target.value)}
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] p-3 text-xs text-white outline-none focus:border-indigo-500/60"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-[#12141A] p-5 space-y-4">
                <h2 className="text-sm font-semibold text-white">Одобренные домены в чате</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Все ссылки в чате не кликабельны, кроме указанных доменов и текущего адреса сайта
                  (<span className="font-mono text-zinc-200">{window.location.hostname}</span> —
                  разрешён автоматически).
                </p>
                <textarea
                  rows={10}
                  value={domainsText}
                  onChange={(e) => setDomainsText(e.target.value)}
                  placeholder="youtube.com&#10;youtu.be"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] p-3 font-mono text-xs text-white outline-none focus:border-indigo-500/60"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-5 py-2.5 text-xs font-medium text-white transition cursor-pointer"
            >
              <Save className="h-4 w-4" />
              Сохранить настройки модерации
            </button>
          </form>
        )}

        {/* System / Admin / Telegram Tab */}
        {tab === 'system' && settings && (
          <form onSubmit={saveSettings} className="flex-1 min-h-0 overflow-y-auto pr-1 space-y-6">
            <div className="max-w-xl space-y-6">
            <div className="rounded-2xl border border-white/10 bg-[#12141A] p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Учётные данные администратора</h2>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Логин администратора</label>
                <input
                  type="text"
                  value={settings.adminUsername}
                  onChange={(e) => setSettings({ ...settings, adminUsername: e.target.value })}
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">
                  Новый пароль (оставьте пустым, чтобы не менять)
                </label>
                <input
                  type="password"
                  value={newAdminPassword}
                  onChange={(e) => setNewAdminPassword(e.target.value)}
                  placeholder="•••••"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#12141A] p-5 space-y-4">
              <h2 className="text-sm font-semibold text-white">Telegram-бот обратной связи</h2>
              <p className="text-xs text-zinc-400">
                Если токен из админки пуст или не удаётся подключиться к Telegram API, сервер
                автоматически использует значения из <code className="text-zinc-200">.env</code>.
              </p>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Bot Token</label>
                <input
                  type="text"
                  value={settings.telegramBotToken}
                  onChange={(e) => setSettings({ ...settings, telegramBotToken: e.target.value })}
                  placeholder="123456:ABC-DEF..."
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 font-mono text-xs text-white outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] text-zinc-400 mb-1">Admin Chat ID</label>
                <input
                  type="text"
                  value={settings.telegramAdminChatId}
                  onChange={(e) =>
                    setSettings({ ...settings, telegramAdminChatId: e.target.value })
                  }
                  placeholder="123456789"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 font-mono text-xs text-white outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-5 py-2.5 text-xs font-medium text-white transition cursor-pointer"
            >
              <Save className="h-4 w-4" />
              Сохранить настройки
            </button>
            </div>
          </form>
        )}
      </main>

      {/* Modal: User Chat Messages */}
      {messagesTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[80vh] rounded-2xl border border-white/12 bg-[#12141A] flex flex-col overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-3.5">
              <span className="text-sm font-semibold text-white">
                Сообщения пользователя: {messagesTarget.username}
              </span>
              <button
                onClick={() => {
                  setMessagesTarget(null);
                  setUserMessages(null);
                }}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
              {!userMessages ? (
                <div className="text-xs text-zinc-500">Загрузка...</div>
              ) : userMessages.length === 0 ? (
                <div className="text-xs text-zinc-500">Сообщений не найдено.</div>
              ) : (
                userMessages.map((m) => (
                  <div
                    key={m.id}
                    className="rounded-xl border border-white/8 bg-[#0B0C10] p-3 space-y-1"
                  >
                    <div className="flex items-center justify-between text-[10px] font-mono text-zinc-500">
                      <span>Зал: {m.roomCode}</span>
                      <span>{new Date(m.createdAt).toLocaleString()}</span>
                    </div>
                    <p className="text-xs text-zinc-200 break-words">{m.text}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reset User Password */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <form
            onSubmit={handleResetPassword}
            className="w-full max-w-sm rounded-2xl border border-white/12 bg-[#12141A] p-5 space-y-4 shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-white">
                Сброс пароля: {resetTarget.username}
              </span>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <input
              type="password"
              required
              minLength={6}
              value={newUserPassword}
              onChange={(e) => setNewUserPassword(e.target.value)}
              placeholder="Новый пароль (мин. 6 символов)"
              className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white outline-none"
            />
            <button
              type="submit"
              className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 py-2 text-xs font-medium text-white cursor-pointer"
            >
              Сохранить новый пароль
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

