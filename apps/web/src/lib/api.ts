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

  listRooms: (params?: {
    q?: string;
    usersFilter?: 'all' | 'with_users' | 'empty';
    minUsers?: number;
    control?: 'all' | 'everyone' | 'host';
    sortUsers?: 'none' | 'desc' | 'asc';
    limit?: number;
    offset?: number;
  }) => {
    const qs = new URLSearchParams();
    if (params?.q) qs.set('q', params.q);
    if (params?.usersFilter && params.usersFilter !== 'all') {
      qs.set('usersFilter', params.usersFilter);
    }
    if (params?.minUsers && params.minUsers > 0) {
      qs.set('minUsers', String(params.minUsers));
    }
    if (params?.control && params.control !== 'all') {
      qs.set('control', params.control);
    }
    if (params?.sortUsers && params.sortUsers !== 'none') {
      qs.set('sortUsers', params.sortUsers);
    }
    if (params?.limit !== undefined) qs.set('limit', String(params.limit));
    if (params?.offset !== undefined) qs.set('offset', String(params.offset));
    const queryStr = qs.toString();

    return request<{
      rooms: Array<{
        code: string;
        name: string;
        participantsCount: number;
        maxUsers: number;
        currentTitle: string | null;
        allowEveryoneControl: boolean;
      }>;
      total: number;
      hasMore: boolean;
      savedRooms: Array<{
        code: string;
        name: string;
        maxUsers: number;
        isHidden: boolean;
        createdAt: number;
      }>;
    }>(`/api/rooms${queryStr ? `?${queryStr}` : ''}`);
  },

  deleteRoom: (code: string) =>
    request<{ ok: boolean }>(`/api/rooms/${encodeURIComponent(code)}`, {
      method: 'DELETE',
    }),

  updateRoomSettings: (code: string, payload: { isPersistent?: boolean; isHidden?: boolean }) =>
    request<{ isPersistent: boolean; isHidden: boolean }>(
      `/api/rooms/${encodeURIComponent(code)}/settings`,
      {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }
    ),

  createRoom: (payload: {
    name: string;
    maxUsers?: number;
    isPersistent?: boolean;
    isHidden?: boolean;
  }) =>
    request<{
      room: {
        code: string;
        name: string;
        maxUsers: number;
        isPersistent: boolean;
        isHidden: boolean;
      };
    }>('/api/rooms', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),

  getRoom: (code: string) =>
    request<{
      room: { code: string; name: string; maxUsers: number; participantsCount: number };
    }>(`/api/rooms/${encodeURIComponent(code)}`),

  resolveMedia: (url: string) =>
    request<{ item: MediaItem }>('/api/media/resolve', {
      method: 'POST',
      body: JSON.stringify({ url }),
    }),

  sendSupportMessage: (payload: { subject: string; body: string; email: string }) =>
    request<{ ok: boolean }>('/api/support/contact', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};

