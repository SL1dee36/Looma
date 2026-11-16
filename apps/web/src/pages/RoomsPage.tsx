// Author: Nazaryan Artem (@sl1dee36)
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Search,
  Shield,
  SlidersHorizontal,
  Tv,
  Users,
} from 'lucide-react';
import { api } from '../lib/api';

interface RoomListItem {
  code: string;
  name: string;
  participantsCount: number;
  maxUsers: number;
  currentTitle: string | null;
  allowEveryoneControl: boolean;
}

interface SelectOption<T extends string> {
  value: T;
  label: string;
}

function DarkSelect<T extends string>({
  value,
  options,
  onChange,
  icon,
}: {
  value: T;
  options: SelectOption<T>[];
  onChange: (val: T) => void;
  icon?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  const active = options.find((o) => o.value === value) ?? options[0];

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition cursor-pointer ${
          open
            ? 'border-indigo-500/50 bg-[#0B0C10] text-white'
            : 'border-white/10 bg-[#0B0C10] text-zinc-200 hover:border-white/20'
        }`}
      >
        <span className="flex items-center gap-2 min-w-0 truncate">
          {icon}
          <span className="truncate">{active.label}</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 text-zinc-500 shrink-0 transition-transform duration-200 ${
            open ? 'rotate-180 text-indigo-300' : ''
          }`}
        />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-40 rounded-xl border border-white/10 bg-[#12141A]/95 backdrop-blur-xl p-1 shadow-2xl space-y-0.5">
          {options.map((opt) => {
            const isSelected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`w-full text-left rounded-lg px-2.5 py-1.5 text-xs transition cursor-pointer ${
                  isSelected
                    ? 'bg-indigo-500/20 text-indigo-200 font-medium'
                    : 'text-zinc-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 24;

export function RoomsPage() {
  const navigate = useNavigate();

  const [q, setQ] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [usersFilter, setUsersFilter] = useState<'all' | 'with_users' | 'empty'>('all');
  const [minUsers, setMinUsers] = useState<string>('');
  const [sortUsers, setSortUsers] = useState<'none' | 'desc' | 'asc'>('none');
  const [control, setControl] = useState<'all' | 'everyone' | 'host'>('all');

  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedQ(q), 250);
    return () => window.clearTimeout(id);
  }, [q]);

  const fetchRooms = useCallback(
    async (offset: number, append: boolean) => {
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const minU = minUsers ? Number(minUsers) : 0;
        const res = await api.listRooms({
          q: debouncedQ,
          usersFilter,
          minUsers: Number.isFinite(minU) && minU > 0 ? minU : 0,
          control,
          sortUsers,
          limit: PAGE_SIZE,
          offset,
        });
        setRooms((prev) => (append ? [...prev, ...res.rooms] : res.rooms));
        setTotal(res.total);
        setHasMore(res.hasMore);
      } catch {
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQ, usersFilter, minUsers, control, sortUsers]
  );

  useEffect(() => {
    fetchRooms(0, false);
  }, [fetchRooms]);

  useEffect(() => {
    const el = sentinelRef.current;
    const root = scrollContainerRef.current;
    if (!el || !root || !hasMore || loading || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          fetchRooms(rooms.length, true);
        }
      },
      { root, rootMargin: '200px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, rooms.length, fetchRooms]);

  return (
    <div className="h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col overflow-hidden">
      <header className="shrink-0 z-30 border-b border-white/8 bg-[#0B0C10]/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition">
            <img src="/favicon.svg" alt="Looma" className="h-8 w-8 shrink-0" />
            <span className="text-base font-semibold tracking-tight">Looma</span>
          </Link>

          <Link
            to="/"
            className="flex items-center gap-1.5 rounded-lg border border-white/8 bg-[#12141A] px-3 py-1.5 text-xs text-zinc-300 hover:text-white transition"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            На главную
          </Link>
        </div>
      </header>

      {/* Fixed Header & Filters */}
      <div className="shrink-0 mx-auto w-full max-w-5xl px-6 pt-6 pb-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-white">Все открытые залы</h1>
            <p className="text-xs text-zinc-400 mt-0.5">
              Найдено: <span className="font-mono text-zinc-200">{total}</span>
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#12141A] p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Поиск по названию фильма, видео, зала или коду..."
              className="w-full rounded-xl border border-white/10 bg-[#0B0C10] pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
            />
          </div>

          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <DarkSelect
              value={usersFilter}
              onChange={setUsersFilter}
              options={[
                { value: 'all', label: 'Участники: все залы' },
                { value: 'with_users', label: 'Есть зрители (> 0)' },
                { value: 'empty', label: 'Пустые (0 зрителей)' },
              ]}
            />

            <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2">
              <Users className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
              <input
                type="number"
                min={0}
                max={50}
                value={minUsers}
                onChange={(e) => setMinUsers(e.target.value)}
                placeholder="Мин. зрителей"
                className="w-full bg-transparent text-xs text-white placeholder-zinc-600 outline-none"
              />
            </div>

            <DarkSelect
              value={sortUsers}
              onChange={setSortUsers}
              options={[
                { value: 'none', label: 'Сортировка: по умолчанию' },
                { value: 'desc', label: 'Больше зрителей' },
                { value: 'asc', label: 'Меньше зрителей' },
              ]}
            />

            <DarkSelect
              value={control}
              onChange={setControl}
              icon={<SlidersHorizontal className="h-3.5 w-3.5 text-zinc-500 shrink-0" />}
              options={[
                { value: 'all', label: 'Права плеера: любые' },
                { value: 'everyone', label: 'Управляют все' },
                { value: 'host', label: 'Только хост' },
              ]}
            />
          </div>
        </div>
      </div>

      {/* Scrollable Rooms List */}
      <div className="flex-1 min-h-0 mx-auto w-full max-w-5xl px-6 flex flex-col">
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto rounded-t-2xl border-t border-x border-white/8 bg-[#0E1015]/60 p-4"
        >
          {loading ? (
            <div className="flex items-center justify-center py-16 text-xs text-zinc-500 gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Загрузка залов...
            </div>
          ) : rooms.length === 0 ? (
            <div className="rounded-2xl border border-white/8 bg-[#12141A] p-10 text-center text-xs text-zinc-400">
              По заданным фильтрам залы не найдены.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {rooms.map((r) => (
                <button
                  key={r.code}
                  onClick={() => navigate(`/room/${r.code}`)}
                  className="group text-left rounded-xl border border-white/8 bg-[#12141A] hover:border-indigo-500/40 p-4 transition cursor-pointer space-y-2.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-sm text-white group-hover:text-indigo-300 transition truncate">
                      {r.name}
                    </span>
                    <span className="font-mono text-[11px] text-zinc-500 bg-[#0B0C10] px-2 py-0.5 rounded border border-white/6 shrink-0">
                      {r.code}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs text-zinc-400">
                    <Tv className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
                    <span className="truncate">{r.currentTitle || 'Ожидание фильма'}</span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-white/6 text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Shield className="h-3 w-3 text-zinc-500" />
                      {r.allowEveryoneControl ? 'Управляют все' : 'Только хост'}
                    </span>
                    <span className="flex items-center gap-1 font-mono">
                      <Users className="h-3 w-3 text-zinc-500" />
                      {r.participantsCount}/{r.maxUsers}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}

          <div ref={sentinelRef} className="h-4" />

          {hasMore && !loading && (
            <div className="flex justify-center pt-2 pb-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchRooms(rooms.length, true)}
                className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#12141A] hover:bg-white/5 px-5 py-2.5 text-xs font-medium text-zinc-200 transition cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Загрузка...
                  </>
                ) : (
                  `Загрузить ещё (${rooms.length} из ${total})`
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      <footer className="shrink-0 border-t border-white/8 py-4 px-6 bg-[#0B0C10]">
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
