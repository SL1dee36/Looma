// Author: Nazaryan Artem (@sl1dee36)
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Plus, ArrowRight, Users, LogOut, Tv, Bookmark, Trash2, EyeOff, Search } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/useAuthStore';
import { AuthPanel } from '../components/AuthPanel';

interface ActiveRoomSummary {
  code: string;
  name: string;
  participantsCount: number;
  maxUsers: number;
  currentTitle: string | null;
}

interface SavedRoomSummary {
  code: string;
  name: string;
  maxUsers: number;
  isHidden: boolean;
  createdAt: number;
}

export function HomePage() {
  const navigate = useNavigate();
  const { user, initialized, logout } = useAuthStore();

  const [roomName, setRoomName] = useState('Вечерний сеанс');
  const [isPersistent, setIsPersistent] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<ActiveRoomSummary[]>([]);
  const [totalRooms, setTotalRooms] = useState(0);
  const [savedRooms, setSavedRooms] = useState<SavedRoomSummary[]>([]);

  useEffect(() => {
    api
      .listRooms({ limit: 12, offset: 0 })
      .then((res) => {
        setActiveRooms(res.rooms);
        setTotalRooms(res.total);
        setSavedRooms(res.savedRooms ?? []);
      })
      .catch(() => {});
  }, [user]);

  const handleDeleteSaved = async (code: string) => {
    try {
      await api.deleteRoom(code);
      setSavedRooms((prev) => prev.filter((r) => r.code !== code));
      setActiveRooms((prev) => prev.filter((r) => r.code !== code));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось удалить комнату');
    }
  };

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      const { room } = await api.createRoom({
        name: roomName.trim() || 'Кинозал',
        isPersistent,
        isHidden,
      });
      navigate(`/room/${room.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать комнату');
    } finally {
      setCreating(false);
    }
  };

  const handleJoin = async (e: FormEvent) => {
    e.preventDefault();
    const cleaned = joinCode.trim().toUpperCase();
    if (!cleaned) return;
    setError(null);
    try {
      await api.getRoom(cleaned);
      navigate(`/room/${cleaned}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Комната не найдена');
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col">
      {/* Minimal Header */}
      <header className="border-b border-white/8 bg-[#0B0C10]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <img src="/favicon.svg" alt="Looma" className="h-8 w-8 shrink-0" />
            <span className="text-base font-semibold tracking-tight">Looma</span>
          </div>

          {user && (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-full border border-white/8 bg-[#12141A] px-3 py-1.5 text-xs">
                <span className="h-2 w-2 rounded-full bg-emerald-400" />
                <span className="font-medium text-zinc-200">{user.username}</span>
                {user.isGuest && <span className="text-zinc-500">(гость)</span>}
              </div>
              <button
                onClick={logout}
                title="Выйти"
                className="rounded-lg border border-white/8 bg-[#12141A] p-2 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-start px-6 pt-8 sm:pt-10 pb-10">
        {!initialized ? (
          <div className="text-sm text-zinc-500">Загрузка...</div>
        ) : !user ? (
          <div className="w-full flex justify-center">
            <AuthPanel subtitle="Платформа для совместного просмотра" />
          </div>
        ) : (
          <div className="w-full max-w-4xl space-y-8">
            <div className="grid gap-6 md:grid-cols-2 lg:sticky lg:top-20 lg:z-20 bg-[#0B0C10]/95 backdrop-blur-md pb-2">
              {/* Create Room Card */}
              <form
                onSubmit={handleCreate}
                className="rounded-2xl border border-white/10 bg-[#12141A] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-indigo-400 mb-3">
                    <Plus className="h-3.5 w-3.5" />
                    Новый зал
                  </div>
                  <h2 className="text-lg font-semibold text-white">Создать комнату</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Вы получите короткий код и ссылку для приглашения друзей.
                  </p>

                  <div className="mt-5 space-y-3">
                    <input
                      type="text"
                      maxLength={48}
                      value={roomName}
                      onChange={(e) => setRoomName(e.target.value)}
                      placeholder="Название кинозала"
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                    />
                    <div className="space-y-2.5 pt-1">
                      {!user.isGuest && (
                        <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-[#0B0C10]/60 px-3 py-2">
                          <div className="min-w-0">
                            <div className="text-xs font-medium text-zinc-200">Вечная комната</div>
                            <div className="text-[11px] text-zinc-500">
                              {savedRooms.length > 0
                                ? `Уже создана (${savedRooms[0].code})`
                                : 'Не удаляется после выхода всех'}
                            </div>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={isPersistent}
                            disabled={savedRooms.length > 0}
                            data-checked={isPersistent ? 'true' : 'false'}
                            onClick={() => setIsPersistent((v) => !v)}
                            className="looma-switch"
                          >
                            <span className="looma-switch-thumb" />
                          </button>
                        </div>
                      )}

                      <div className="flex items-center justify-between gap-3 rounded-xl border border-white/6 bg-[#0B0C10]/60 px-3 py-2">
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-zinc-200">Скрытый зал</div>
                          <div className="text-[11px] text-zinc-500">Доступ только по ссылке</div>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={isHidden}
                          data-checked={isHidden ? 'true' : 'false'}
                          onClick={() => setIsHidden((v) => !v)}
                          className="looma-switch"
                        >
                          <span className="looma-switch-thumb" />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={creating}
                  className="mt-6 w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition cursor-pointer"
                >
                  {creating ? 'Создаём...' : 'Создать кинозал'}
                </button>
              </form>

              {/* Join Room Card */}
              <form
                onSubmit={handleJoin}
                className="rounded-2xl border border-white/10 bg-[#12141A] p-6 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-400 mb-3">
                    <ArrowRight className="h-3.5 w-3.5" />
                    Присоединиться
                  </div>
                  <h2 className="text-lg font-semibold text-white">Войти по коду</h2>
                  <p className="mt-1 text-xs text-zinc-400">
                    Введите 6-значный код комнаты, которым поделился хост.
                  </p>

                  <div className="mt-5">
                    <input
                      type="text"
                      maxLength={10}
                      value={joinCode}
                      onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                      placeholder="A7K9P2"
                      className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2.5 font-mono text-base tracking-widest text-white placeholder-zinc-700 outline-none focus:border-indigo-500/60 uppercase"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!joinCode.trim()}
                  className="mt-6 w-full rounded-xl border border-white/12 bg-[#181B22] hover:bg-white/10 disabled:opacity-40 px-4 py-2.5 text-sm font-medium text-white transition cursor-pointer"
                >
                  Войти в зал
                </button>
              </form>
            </div>

            {error && (
              <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs text-red-300">
                {error}
              </div>
            )}

            {savedRooms.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                  <Bookmark className="h-3.5 w-3.5" />
                  Мои сохранённые залы
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {savedRooms.map((r) => (
                    <div
                      key={r.code}
                      onClick={() => navigate(`/room/${r.code}`)}
                      className="group rounded-xl border border-indigo-500/20 bg-[#12141A] hover:border-indigo-500/50 p-4 transition cursor-pointer flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-sm text-white group-hover:text-indigo-300 transition truncate">
                            {r.name}
                          </span>
                          {r.isHidden && (
                            <span title="Скрытая комната (доступ только по ссылке)">
                              <EyeOff className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
                            </span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-zinc-500">{r.code}</div>
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSaved(r.code);
                        }}
                        title="Удалить сохранённую комнату"
                        className="rounded-lg p-1.5 text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition cursor-pointer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeRooms.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Активные залы сейчас
                </h3>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {activeRooms.map((r) => (
                    <button
                      key={r.code}
                      onClick={() => navigate(`/room/${r.code}`)}
                      className="group text-left rounded-xl border border-white/8 bg-[#12141A] hover:border-indigo-500/40 p-4 transition cursor-pointer"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-white group-hover:text-indigo-300 transition truncate">
                          {r.name}
                        </span>
                        <span className="font-mono text-[11px] text-zinc-500 bg-[#0B0C10] px-2 py-0.5 rounded border border-white/6">
                          {r.code}
                        </span>
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-xs text-zinc-400">
                        <span className="flex items-center gap-1.5 truncate">
                          <Tv className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                          <span className="truncate">{r.currentTitle || 'Ожидание фильма'}</span>
                        </span>
                        <span className="flex items-center gap-1 shrink-0 ml-2">
                          <Users className="h-3.5 w-3.5 text-zinc-500" />
                          {r.participantsCount}/{r.maxUsers}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {totalRooms > 12 && (
                  <div className="flex justify-center pt-3">
                    <Link
                      to="/rooms"
                      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#12141A] hover:border-indigo-500/40 hover:bg-[#181B22] px-5 py-2.5 text-xs font-medium text-zinc-200 transition"
                    >
                      <Search className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Список всех залов ({totalRooms})</span>
                      <ArrowRight className="h-3.5 w-3.5 text-zinc-400" />
                    </Link>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="border-t border-white/8 py-5 px-6">
        <div className="mx-auto max-w-5xl flex flex-wrap items-center justify-between gap-4 text-xs text-zinc-500">
          <span>© {new Date().getFullYear()} Looma</span>
          <div className="flex items-center gap-5">
            <Link to="/about" className="hover:text-zinc-200 transition">
              О нас
            </Link>
            <Link to="/faq" className="hover:text-zinc-200 transition">
              FAQ
            </Link>
            <Link to="/rules" className="hover:text-zinc-200 transition">
              Правила
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

