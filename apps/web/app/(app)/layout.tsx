import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/shell/AuthGuard';
import { AppShell } from '@/components/shell/AppShell';

// Authenticated route group: the guard sits OUTSIDE the shell so a signed-out
// visitor is redirected to /login before any chrome renders.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
