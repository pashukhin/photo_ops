'use client';

import type { ReactNode } from 'react';

// GREEN obligation (session 014): gate on useSession().status — 'loading' → a
// non-blocking loading state (no children, no redirect); 'anonymous' →
// useRouter().replace('/login') in an effect + no children; 'authenticated' →
// {children}. The stub renders an inert placeholder so all three cases are RED.
export function AuthGuard({ children }: { children: ReactNode }) {
  void children;
  return <div data-authguard-stub />;
}
