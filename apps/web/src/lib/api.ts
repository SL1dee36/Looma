// Author: Nazaryan Artem (@sl1dee36)
import type { MediaItem, UserDTO } from '@looma/shared';

const TOKEN_KEY = 'looma_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(path, { ...init, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Ошибка ${res.status}`);
  }
  return data as T;
}

export const api = {
  guestLogin: (username: string) =>
    request<{ token: string; user: UserDTO }>('/api/auth/guest', {
      method: 'POST',
      body: JSON.stringify({ username }),
    }),

  register: (username: string, password: string) =>
    request<{ token: string; user: UserDTO }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  login: (username: string, password: string) =>
    request<{ token: string; user: UserDTO }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: UserDTO }>('/api/auth/me'),

  listRooms: () =>
    request<{
      rooms: Array<{
        code: string;
        name: string;
        participantsCount: number;
        maxUsers: number;
        currentTitle: string | null;
      }>;
    }>('/api/rooms'),

  createRoom: (payload: { name: string; maxUsers?: number; isPersistent?: boolean }) =>
    request<{ room: { code: string; name: string; maxUsers: number; isPersistent: boolean } }>(
      '/api/rooms',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    ),

  getRoom: (code: string) =>
    request<{
      room: { code: string; name: string; maxUsers: number; participantsCount: number };
    }>(`/api/rooms/${encodeURIComponent(code)}`),

  resolveMedia: (url: string) =>
    request<{ item: MediaItem }>('/api/media/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),
};

