// Author: Nazaryan Artem (@sl1dee36)
import { create } from 'zustand';
import type { UserDTO } from '@looma/shared';
import { api, getStoredToken, setStoredToken } from '../lib/api';

interface AuthState {
  user: UserDTO | null;
  token: string | null;
  initialized: boolean;
  init: () => Promise<void>;
  loginAsGuest: (username: string) => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: getStoredToken(),
  initialized: false,

  init: async () => {
    const token = getStoredToken();
    if (!token) {
      set({ initialized: true, user: null, token: null });
      return;
    }
    try {
      const { user } = await api.me();
      set({ user, token, initialized: true });
    } catch {
      setStoredToken(null);
      set({ user: null, token: null, initialized: true });
    }
  },

  loginAsGuest: async (username) => {
    const { token, user } = await api.guestLogin(username);
    setStoredToken(token);
    set({ token, user, initialized: true });
  },

  login: async (username, password) => {
    const { token, user } = await api.login(username, password);
    setStoredToken(token);
    set({ token, user, initialized: true });
  },

  register: async (username, password) => {
    const { token, user } = await api.register(username, password);
    setStoredToken(token);
    set({ token, user, initialized: true });
  },

  logout: () => {
    setStoredToken(null);
    set({ user: null, token: null });
  },
}));

