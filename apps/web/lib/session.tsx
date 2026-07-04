'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { getCurrentUser, login as apiLogin, logout as apiLogout, signUp as apiSignUp, type CurrentUser } from '@/lib/api';

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

interface SessionState {
  user: CurrentUser | null;
  status: SessionStatus;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, status: 'loading' });
  // Guards against a mount/refresh fetch resolving after a later mutation
  // (login/signUp/logout) has already settled the session — the mutation's
  // result must win, not a stale getCurrentUser() response.
  const requestIdRef = useRef(0);

  const fetchSession = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const user = await getCurrentUser();
      if (requestIdRef.current !== requestId) {
        return;
      }
      setState(user ? { user, status: 'authenticated' } : { user: null, status: 'anonymous' });
    } catch {
      if (requestIdRef.current !== requestId) {
        return;
      }
      setState({ user: null, status: 'anonymous' });
    }
  }, []);

  useEffect(() => {
    void fetchSession();
  }, [fetchSession]);

  const login = useCallback(async (email: string, password: string) => {
    const user = await apiLogin({ email, password });
    requestIdRef.current += 1;
    setState({ user, status: 'authenticated' });
  }, []);

  const signUp = useCallback(async (email: string, password: string, displayName: string) => {
    const user = await apiSignUp({ email, password, displayName });
    requestIdRef.current += 1;
    setState({ user, status: 'authenticated' });
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    requestIdRef.current += 1;
    setState({ user: null, status: 'anonymous' });
  }, []);

  const value: SessionContextValue = {
    user: state.user,
    status: state.status,
    login,
    signUp,
    logout,
    refresh: fetchSession
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
