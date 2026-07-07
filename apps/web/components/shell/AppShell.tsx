'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { label: 'Photos', href: '/photos' },
  { label: 'Clusters', href: '/clusters' },
  { label: 'Posts', href: '/posts' },
  { label: 'Usage', href: '/usage' }
] as const;

// GREEN obligation (session 014): render a top bar — brand link → /photos; nav
// Photos·Clusters·Usage with aria-current="page" on the active link (from
// usePathname); user menu with useSession().user.displayName + a Log out control
// calling useSession().logout — then {children} below.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useSession();
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const handleLogout = async () => {
    setLogoutError(null);
    try {
      await logout();
    } catch {
      setLogoutError('Log out failed. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-background">
        <div className="flex h-14 items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-6">
            <Link href="/photos" className="text-sm font-semibold tracking-tight">
              Photo Ops
            </Link>
            <nav aria-label="Primary" className="flex items-center gap-4">
              {NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'text-sm font-medium text-muted-foreground transition-colors hover:text-foreground',
                      isActive && 'text-foreground'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          {user ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{user.displayName}</span>
              <Button variant="outline" size="sm" onClick={() => void handleLogout()}>
                Log out
              </Button>
            </div>
          ) : null}
        </div>
      </header>
      {logoutError ? (
        <div
          role="alert"
          className="border-b border-destructive bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {logoutError}
        </div>
      ) : null}
      <main className="flex-1">{children}</main>
    </div>
  );
}
