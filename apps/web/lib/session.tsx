'use client';

import { createContext, useContext, type ReactNode } from 'react';
import type { CurrentUser } from '@/lib/api';

export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';

export interface SessionContextValue {
  user: CurrentUser | null;
  status: SessionStatus;
  login: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

// GREEN obligation (session 014): fetch getCurrentUser on mount into {user,status}
// (authenticated with the user, or anonymous on null/reject — never throw); implement
// login/signUp/logout/refresh via lib/api (see lib/session.spec.tsx). The stub
// provides a resolvable context whose methods are unimplemented, so useSession()
// works but the behavior tests are RED.
export function SessionProvider({ children }: { children: ReactNode }) {
  const value: SessionContextValue = {
    user: null,
    status: 'loading',
    // NotImplemented (GREEN obligation above): inert no-ops so useSession() works
    // and the behavior specs are RED via assertions (delegation never happens),
    // without throwing — a thrown stub makes vitest exit 2 and skip coverage.
    login: () => Promise.resolve(),
    signUp: () => Promise.resolve(),
    logout: () => Promise.resolve(),
    refresh: () => Promise.resolve()
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  const ctx = useContext(SessionContext);
  if (!ctx) {
    throw new Error('useSession must be used within a SessionProvider');
  }
  return ctx;
}
