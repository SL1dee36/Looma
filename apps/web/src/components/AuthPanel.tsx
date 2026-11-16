// Author: Nazaryan Artem (@sl1dee36)
import { useState, type FormEvent } from 'react';
import { Sparkles, UserCheck, LogIn } from 'lucide-react';
import { useAuthStore } from '../stores/useAuthStore';

interface AuthPanelProps {
  title?: string;
  subtitle?: string;
  onSuccess?: () => void;
}

export function AuthPanel({
  title = 'Добро пожаловать в Looma',
  subtitle = 'Введите никнейм для мгновенного входа или используйте постоянный аккаунт',
  onSuccess,
}: AuthPanelProps) {
  const { loginAsGuest, login, register } = useAuthStore();
  const [mode, setMode] = useState<'guest' | 'login' | 'register'>('guest');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === 'guest') {
        await loginAsGuest(username);
      } else if (mode === 'login') {
        await login(username, password);
      } else {
        await register(username, password);
      }
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка входа');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12141A] p-7 shadow-2xl">
      <div className="mb-6">
        <h2 className="text-xl font-semibold tracking-tight text-[#F3F4F6]">{title}</h2>
        <p className="mt-1.5 text-sm text-zinc-400">{subtitle}</p>
      </div>

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-xl bg-[#0B0C10] p-1 border border-white/6">
        <button
          type="button"
          onClick={() => {
            setMode('guest');
            setError(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
            mode === 'guest'
              ? 'bg-[#181B22] text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Гость
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('login');
            setError(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
            mode === 'login'
              ? 'bg-[#181B22] text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <LogIn className="h-3.5 w-3.5" />
          Вход
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('register');
            setError(null);
          }}
          className={`flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-medium transition ${
            mode === 'register'
              ? 'bg-[#181B22] text-white shadow-sm'
              : 'text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <UserCheck className="h-3.5 w-3.5" />
          Аккаунт
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-zinc-400 mb-1.5">Никнейм</label>
          <input
            type="text"
            required
            minLength={2}
            maxLength={24}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Например, Alex"
            className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-indigo-500/60"
          />
        </div>

        {mode !== 'guest' && (
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Пароль</label>
            <input
              type="password"
              required
              minLength={6}
              maxLength={128}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Минимум 6 символов"
              className="w-full rounded-xl border border-white/10 bg-[#0B0C10] px-3.5 py-2.5 text-sm text-white placeholder-zinc-600 outline-none transition focus:border-indigo-500/60"
            />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-300">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 px-4 py-2.5 text-sm font-medium text-white transition cursor-pointer"
        >
          {loading
            ? 'Подождите...'
            : mode === 'guest'
              ? 'Войти без регистрации'
              : mode === 'login'
                ? 'Войти в аккаунт'
                : 'Создать аккаунт'}
        </button>
      </form>
    </div>
  );
}

