'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
  token: string | null;
  user: { id: string; email: string; name?: string } | null;
  workspace: { id: string; slug: string; name: string } | null;
  setAuth: (token: string, user: any, workspace: any) => void;
  clear: () => void;
}

export const useAuth = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      workspace: null,
      setAuth: (token, user, workspace) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('xrules_token', token);
        }
        set({ token, user, workspace });
      },
      clear: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('xrules_token');
        }
        set({ token: null, user: null, workspace: null });
      },
    }),
    { name: 'xrules-auth' },
  ),
);

interface ProjectState {
  currentProjectId: string | null;
  setCurrentProject: (id: string | null) => void;
}

export const useProject = create<ProjectState>()(
  persist(
    (set) => ({
      currentProjectId: null,
      setCurrentProject: (id) => set({ currentProjectId: id }),
    }),
    { name: 'xrules-project' },
  ),
);

interface ThemeState {
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggle: () => void;
}

export const useTheme = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'light',
      setTheme: (t) => {
        if (typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', t);
        }
        set({ theme: t });
      },
      toggle: () => {
        const next = get().theme === 'light' ? 'dark' : 'light';
        get().setTheme(next);
      },
    }),
    {
      name: 'xrules-theme',
      onRehydrateStorage: () => (state) => {
        if (state && typeof document !== 'undefined') {
          document.documentElement.setAttribute('data-theme', state.theme);
        }
      },
    },
  ),
);
