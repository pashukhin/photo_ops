'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';

// Gates the authenticated route group on session status: 'loading' → a
// non-blocking loading state (no children, no redirect); 'anonymous' →
// redirect to /login (in an effect, since redirecting during render is a
// React error) + no children; 'authenticated' → render {children}.
export function AuthGuard({ children }: { children: ReactNode }) {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') {
      router.replace('/login');
    }
  }, [status, router]);

  if (status === 'authenticated') {
    return <>{children}</>;
  }

  return null;
}
