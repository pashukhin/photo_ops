'use client';

import type { ReactNode } from 'react';

// GREEN obligation (session 014): render a top bar — brand link → /photos; nav
// Photos·Clusters·Usage with aria-current="page" on the active link (from
// usePathname); user menu with useSession().user.displayName + a Log out control
// calling useSession().logout — then {children} below. Visual form is exploratory
// (smoke-covered). The stub renders only children so the nav/user-menu tests are RED.
export function AppShell({ children }: { children: ReactNode }) {
  return <div data-appshell-stub>{children}</div>;
}
