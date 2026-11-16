// Author: Nazaryan Artem (@sl1dee36)
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeft,
  Film,
  GripHorizontal,
  HelpCircle,
  Info,
  MessageCircle,
  Scale,
  Send,
  X,
} from 'lucide-react';
import { api } from '../lib/api';

type InfoTab = 'about' | 'faq' | 'rules';

const FAQ_ITEMS = [
  {
    q: 'Как пригласить друзей в кинозал?',
    a: 'Создайте комнату на главной странице и скопируйте 6-значный код или ссылку в шапке зала. Друзья могут зайти как гости по никнейму без регистрации.',
  },
  {
    q: 'Чем отличается вечная комната от обычной?',
    a: 'Обычная (временная) комната автоматически удаляется через 10 секунд после того, как из неё выйдут все участники. Зарегистрированный пользователь может сохранить 1 вечную комнату, которая не удаляется.',
  },
  {
    q: 'Что такое скрытый зал?',
    a: 'Скрытая комната не отображается в списке активных залов на главной странице — попасть в неё можно только по прямой ссылке или коду.',
  },
  {
    q: 'Какие источники видео поддерживаются?',
    a: 'Ссылки на YouTube, прямые потоки (.m3u8 / .mp4 / .webm), а также ссылки на страницы с фильмами и сериалами — встроенный парсер автоматически найдёт плеер или балансеры (с выбором сезонов и озвучек).',
  },
];

export function InfoPage() {
  const { pathname } = useLocation();
  const activeTab: InfoTab =
    pathname === '/faq' ? 'faq' : pathname === '/rules' ? 'rules' : 'about';

  const [chatOpen, setChatOpen] = useState(false);
  const [chatRect, setChatRect] = useState(() => {
    const w = typeof window !== 'undefined' ? Math.min(360, window.innerWidth - 24) : 360;
    const h = 450;
    const x = typeof window !== 'undefined' ? Math.max(12, window.innerWidth - w - 20) : 20;
    const y = typeof window !== 'undefined' ? Math.max(12, window.innerHeight - h - 20) : 20;
    return { x, y, width: w, height: h };
  });
  const interactionRef = useRef<{
    mode: 'drag' | 'resize';
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    origH: number;
  } | null>(null);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      const act = interactionRef.current;
      if (!act) return;
      const dx = e.clientX - act.startX;
      const dy = e.clientY - act.startY;

      if (act.mode === 'drag') {
        const nextX = Math.min(
          Math.max(8, act.origX + dx),
          Math.max(8, window.innerWidth - act.origW - 8)
        );
        const nextY = Math.min(
          Math.max(8, act.origY + dy),
          Math.max(8, window.innerHeight - act.origH - 8)
        );
        setChatRect((r) => ({ ...r, x: nextX, y: nextY }));
      } else {
        const maxW = Math.min(680, window.innerWidth - act.origX - 8);
        const maxH = Math.min(720, window.innerHeight - act.origY - 8);
        const nextW = Math.min(maxW, Math.max(290, act.origW + dx));
        const nextH = Math.min(maxH, Math.max(360, act.origH + dy));
        setChatRect((r) => ({ ...r, width: nextW, height: nextH }));
      }
    };

    const onPointerUp = () => {
      interactionRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, []);

  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      await api.sendSupportMessage({ subject, body, email });
      setSent(true);
      setSubject('');
      setBody('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось отправить обращение');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0C10] text-[#F3F4F6] flex flex-col">
      <header className="border-b border-white/8 bg-[#0B0C10]/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-500/15 border border-indigo-400/30 text-indigo-300">
              <Film className="h-4 w-4" />
            </div>
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

      <main className="flex-1 mx-auto w-full max-w-4xl px-6 py-10 space-y-8">
        <div className="flex flex-wrap gap-2">
          <Link
            to="/about"
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
              activeTab === 'about'
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-white/8 bg-[#12141A] text-zinc-400 hover:text-white'
            }`}
          >
            <Info className="h-3.5 w-3.5" />О нас
          </Link>
          <Link
            to="/faq"
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
              activeTab === 'faq'
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-white/8 bg-[#12141A] text-zinc-400 hover:text-white'
            }`}
          >
            <HelpCircle className="h-3.5 w-3.5" />
            FAQ
          </Link>
          <Link
            to="/rules"
            className={`flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-medium transition ${
              activeTab === 'rules'
                ? 'border-indigo-500/40 bg-indigo-500/15 text-indigo-200'
                : 'border-white/8 bg-[#12141A] text-zinc-400 hover:text-white'
            }`}
          >
            <Scale className="h-3.5 w-3.5" />
            Правила и правовая информация
          </Link>
        </div>

        {activeTab === 'about' && (
          <section className="rounded-2xl border border-white/10 bg-[#12141A] p-7 space-y-4">
            <h1 className="text-xl font-semibold text-white">О платформе Looma</h1>
            <p className="text-sm text-zinc-300 leading-relaxed">
              Looma — лёгкая платформа для совместного просмотра видео в реальном времени. Мы
              сфокусировались на минимализме, мгновенной синхронизации таймкодов через WebSocket и
              комфортном общении без перегруженного интерфейса.
            </p>
            <p className="text-sm text-zinc-400 leading-relaxed">
              Сервис не хранит и не транслирует собственные видеофайлы: воспроизведение происходит
              по внешним ссылкам, которые добавляют сами участники комнаты.
            </p>
          </section>
        )}

        {activeTab === 'faq' && (
          <section className="space-y-3">
            {FAQ_ITEMS.map((item) => (
              <div
                key={item.q}
                className="rounded-2xl border border-white/10 bg-[#12141A] p-5 space-y-2"
              >
                <h2 className="text-sm font-semibold text-white">{item.q}</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">{item.a}</p>
              </div>
            ))}
          </section>
        )}

        {activeTab === 'rules' && (
          <section className="rounded-2xl border border-white/10 bg-[#12141A] p-7 space-y-5">
            <h1 className="text-xl font-semibold text-white">Правила платформы</h1>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-100">1. Общие правила общения</h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                В комнатах и чате запрещены спам, оскорбления, публикация вредоносных ссылок,
                персональных данных третьих лиц и контента, нарушающего действующее законодательство.
              </p>
            </div>

            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-zinc-100">
                2. Контент и ответственность пользователей
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Looma не размещает, не хранит и не индексирует медиафайлы на собственных серверах.
                Всю ответственность за добавляемые в комнату ссылки несут пользователи,
                инициировавшие просмотр.
              </p>
            </div>

            <div className="rounded-xl border border-indigo-500/20 bg-indigo-500/8 p-4 space-y-3">
              <h2 className="text-sm font-semibold text-indigo-200">
                3. Сотрудничество с правообладателями и государственными органами
              </h2>
              <p className="text-xs text-zinc-300 leading-relaxed">
                Администрация Looma уважает интеллектуальную собственность и требования закона. Мы
                открыты к прямому взаимодействию с правообладателями и уполномоченными
                государственными органами: при получении обоснованного обращения мы готовы
                оперативно ограничить доступ к конкретным ресурсам, доменам или ссылкам на уровне
                платформы.
              </p>
              <button
                type="button"
                onClick={() => {
                  setChatOpen(true);
                  setSent(false);
                  setError(null);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 px-3.5 py-2 text-xs font-medium text-white transition cursor-pointer"
              >
                <MessageCircle className="h-3.5 w-3.5" />
                Обратиться
              </button>
            </div>
          </section>
        )}
      </main>

      {chatOpen && (
        <div
          style={{
            left: `${chatRect.x}px`,
            top: `${chatRect.y}px`,
            width: `${chatRect.width}px`,
            height: `${chatRect.height}px`,
          }}
          className="fixed z-50 flex flex-col rounded-2xl border border-white/12 bg-[#12141A]/95 backdrop-blur-xl shadow-2xl overflow-hidden"
        >
          <div
            onPointerDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) return;
              e.preventDefault();
              interactionRef.current = {
                mode: 'drag',
                startX: e.clientX,
                startY: e.clientY,
                origX: chatRect.x,
                origY: chatRect.y,
                origW: chatRect.width,
                origH: chatRect.height,
              };
            }}
            className="flex shrink-0 items-center justify-between border-b border-white/8 px-4 py-3 cursor-grab active:cursor-grabbing select-none"
          >
            <div className="flex items-center gap-2">
              <GripHorizontal className="h-4 w-4 text-zinc-500" />
              <MessageCircle className="h-4 w-4 text-indigo-400" />
              <span className="text-xs font-semibold text-white">Обращение в администрацию</span>
            </div>
            <button
              type="button"
              onClick={() => setChatOpen(false)}
              className="rounded-lg p-1 text-zinc-400 hover:text-white transition cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {sent ? (
            <div className="flex-1 flex flex-col items-center justify-center p-5 space-y-3 text-center">
              <p className="text-xs text-emerald-300 leading-relaxed">
                Обращение отправлено. Администрация ответит на указанную почту в течение 30 рабочих
                дней.
              </p>
              <button
                type="button"
                onClick={() => setSent(false)}
                className="rounded-xl border border-white/10 bg-[#181B22] hover:bg-white/10 px-3.5 py-2 text-xs text-zinc-200 transition cursor-pointer"
              >
                Отправить ещё
              </button>
            </div>
          ) : (
            <form onSubmit={handleSend} className="flex-1 min-h-0 flex flex-col p-4 gap-3 overflow-y-auto">
              <div className="shrink-0">
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Тема обращения
                </label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={120}
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="Например, запрос правообладателя"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                />
              </div>

              <div className="flex-1 min-h-[90px] flex flex-col">
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Тело обращения
                </label>
                <textarea
                  required
                  minLength={5}
                  maxLength={3000}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder="Опишите обращение и приложите ссылки..."
                  className="flex-1 w-full resize-none rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                />
              </div>

              <div className="shrink-0">
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                  Почта для обратной связи
                </label>
                <input
                  type="email"
                  required
                  maxLength={120}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3 py-2 text-xs text-white placeholder-zinc-600 outline-none focus:border-indigo-500/60"
                />
              </div>

              {error && (
                <div className="shrink-0 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[11px] text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={sending}
                className="shrink-0 w-full flex items-center justify-center gap-1.5 rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2 text-xs font-medium text-white transition cursor-pointer"
              >
                <Send className="h-3.5 w-3.5" />
                {sending ? 'Отправка...' : 'Отправить'}
              </button>

              <p className="shrink-0 text-[10px] text-center text-zinc-500">
                Администрация ответит в течение 30 рабочих дней.
              </p>
            </form>
          )}

          {/* Bottom-right resize handle */}
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              interactionRef.current = {
                mode: 'resize',
                startX: e.clientX,
                startY: e.clientY,
                origX: chatRect.x,
                origY: chatRect.y,
                origW: chatRect.width,
                origH: chatRect.height,
              };
            }}
            title="Потяните, чтобы изменить размер"
            className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize flex items-end justify-end p-1 text-zinc-500 hover:text-zinc-300"
          >
            <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 fill-current">
              <path d="M9 1v8H1l8-8z" />
            </svg>
          </div>
        </div>
      )}

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

