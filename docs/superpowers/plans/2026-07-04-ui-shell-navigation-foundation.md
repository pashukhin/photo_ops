# UI Shell & Navigation Foundation — Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the web app a real application shell — a persistent top nav bar, a shared session/auth boundary, and a clean route structure — so Photos, Clusters, and Usage become coherent sections instead of orphan pages.

**Architecture / WHY:** One `SessionProvider` (client context) is the single source of the current user; a route-group `(app)` layout composes an `AuthGuard` (redirects anonymous → `/login`) around an `AppShell` (top bar + nav + user menu). `/login` sits outside the group (bare, redirects an already-authed visitor → `/photos`). Entry points: session contract → `apps/web/lib/session.tsx`; shell/guard → `apps/web/components/shell/*`; login/photos → `apps/web/components/{auth,photos}/*`; behavior → the `*.spec.tsx` beside each; live flow → `apps/web/smoke/*.smoke.ts`. Durable why + rejected alternatives live in the design spec (`docs/superpowers/specs/2026-07-03-ui-shell-navigation-foundation-design.md`) and `apps/web/CLAUDE.md` `## Local invariants` — not restated here.

**Tech Stack:** Next.js 15 (App Router, route groups), React 19, TypeScript (strict), Tailwind v4 + shadcn/ui, vitest + @testing-library/react (jsdom), Playwright (`make smoke-ui`).

## Global Constraints

- Web-only: no backend / proto / gateway change. All auth/session calls already exist in `apps/web/lib/api.ts` (`getCurrentUser`, `login`, `signUp`, `logout`).
- Two lanes (Decision 1): **behavior** (session status, nav active-state, guard redirects, logout, login submit, root/login redirects) → executable RED tests. **Visual form** (shell/login layout, styling) → exploratory; exercised by the live smoke, NOT frozen in jsdom class/snapshot tests.
- `SessionProvider` is the **only** place that imports the `lib/api` auth endpoints. `AppShell` / `AuthGuard` / `LoginScreen` reach auth **only** through `useSession()`.
- Active-nav state is pinned as `aria-current="page"` on the active link (accessible, observable contract — not an incidental class).
- New/moved files use the `@/*` path alias (configured in `tsconfig.json` + `vitest.config.ts`).
- Gate tier (Decision 7): `make skeleton-gate` (100% new/changed lines have a covering RED test) before human review; `make coverage-gate` + `make smoke-ui` green before merge; `make test-guard` — the HomePage-test rewrite (Task 6) needs an `Allow-test-removal:` commit trailer.

## Non-Goals

Gallery-internal redesign; deeper cluster-tree UI (covers, per-node counts, publish-from-cluster); `photo_ops-n7w` (bound the clustering `generate()` poll); usage section beyond hosting the existing report; theming/dark-mode; responsive work beyond "does not break"; any backend/proto/gateway change. Deep-link "return to intended section after login" is out — simplest form: land on `/photos` (design edge-states §). `SessionProvider` does no token refresh/expiry handling beyond `refresh()` re-fetching `getCurrentUser`.

---

### Task 1: Session context — `lib/session.tsx` (architecture-sensitive: auth/session boundary)

**Files:**
- Stub: `apps/web/lib/session.tsx`
- Test: `apps/web/lib/session.spec.tsx` (RED)

**Interfaces:**
- Consumes: `getCurrentUser`, `login`, `signUp`, `logout`, `CurrentUser` from `@/lib/api`.
- Produces:
  ```ts
  export type SessionStatus = 'loading' | 'anonymous' | 'authenticated';
  export interface SessionContextValue {
    user: CurrentUser | null;
    status: SessionStatus;
    login: (email: string, password: string) => Promise<void>;
    signUp: (email: string, password: string, displayName: string) => Promise<void>;
    logout: () => Promise<void>;
    refresh: () => Promise<void>;
  }
  export function SessionProvider(props: { children: ReactNode }): JSX.Element;
  export function useSession(): SessionContextValue;
  ```

**GREEN obligation (for the implementer):** on mount, `SessionProvider` calls `getCurrentUser()` and resolves `status` (`authenticated` with the user, or `anonymous` on `null`/reject — never throws/white-screens). `login`/`signUp` call the matching `lib/api` fn and set `{user, status:'authenticated'}`; a failure rejects (so `LoginScreen` can show it) and leaves status unchanged. `logout` calls `api.logout` and clears to `anonymous`. `refresh` re-runs `getCurrentUser`. `useSession()` throws if used outside the provider. Make the RED tests below pass within these stubs; you may add narrower tests but may not weaken/rename these.

- [ ] **Step 1: Write the RED tests** — `apps/web/lib/session.spec.tsx`

```tsx
import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { SessionProvider, useSession } from '@/lib/session';

vi.mock('@/lib/api', () => ({
  getCurrentUser: vi.fn(),
  login: vi.fn(),
  signUp: vi.fn(),
  logout: vi.fn()
}));

const USER = { userId: 'u1', email: 'a@b.co', displayName: 'Ada' };

function Probe() {
  const s = useSession();
  return <div>status:{s.status};user:{s.user?.displayName ?? 'none'}</div>;
}
const wrapper = ({ children }: { children: React.ReactNode }) => <SessionProvider>{children}</SessionProvider>;

beforeEach(() => {
  vi.mocked(api.getCurrentUser).mockResolvedValue(USER);
  vi.mocked(api.login).mockResolvedValue(USER);
  vi.mocked(api.signUp).mockResolvedValue(USER);
  vi.mocked(api.logout).mockResolvedValue(undefined);
});

describe('SessionProvider', () => {
  it('resolves to authenticated with the fetched user on mount', async () => {
    // why: one getCurrentUser fetch is the single source of the current user
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:authenticated;user:Ada')).toBeTruthy());
    expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
  });

  it('resolves to anonymous when getCurrentUser returns null', async () => {
    // why: signed-out boot must land on the login experience, not loading forever
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:anonymous;user:none')).toBeTruthy());
  });

  it('treats a failed session fetch as anonymous (no white-screen)', async () => {
    // why: design edge-state — a fetch error must degrade to /login, not crash
    vi.mocked(api.getCurrentUser).mockRejectedValue(new Error('boom'));
    render(<Probe />, { wrapper });
    await waitFor(() => expect(screen.getByText('status:anonymous;user:none')).toBeTruthy());
  });

  it('login sets the authenticated user via the api', async () => {
    // why: login flows through the context, not the page
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => { await result.current.login('a@b.co', 'pw'); });
    expect(api.login).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw' });
    expect(result.current.status).toBe('authenticated');
    expect(result.current.user?.displayName).toBe('Ada');
  });

  it('signUp sets the authenticated user via the api', async () => {
    // why: sign-up is a session mutation like login, owned by the context
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await act(async () => { await result.current.signUp('a@b.co', 'pw', 'Ada'); });
    expect(api.signUp).toHaveBeenCalledWith({ email: 'a@b.co', password: 'pw', displayName: 'Ada' });
    expect(result.current.status).toBe('authenticated');
  });

  it('login rejects (and keeps status) when the api fails', async () => {
    // why: LoginScreen shows the inline error, so login must surface the failure
    vi.mocked(api.getCurrentUser).mockResolvedValue(null);
    vi.mocked(api.login).mockRejectedValue(new Error('bad creds'));
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('anonymous'));
    await expect(result.current.login('a@b.co', 'x')).rejects.toThrow('bad creds');
    expect(result.current.status).toBe('anonymous');
  });

  it('logout clears the user to anonymous', async () => {
    // why: a shared logout is the whole point of the shared boundary
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => { await result.current.logout(); });
    expect(api.logout).toHaveBeenCalledTimes(1);
    expect(result.current.status).toBe('anonymous');
    expect(result.current.user).toBeNull();
  });

  it('refresh re-fetches the current user', async () => {
    // why: mutations elsewhere can ask the context to re-sync
    const { result } = renderHook(() => useSession(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe('authenticated'));
    await act(async () => { await result.current.refresh(); });
    expect(api.getCurrentUser).toHaveBeenCalledTimes(2);
  });

  it('useSession throws outside a provider', () => {
    // why: misuse must fail loud, not read a stale/undefined session
    expect(() => renderHook(() => useSession())).toThrow(/SessionProvider/);
  });
});
```

- [ ] **Step 2: Run to confirm RED** — `cd apps/web && pnpm vitest run lib/session.spec.tsx` — expect FAIL on assertions (stub keeps `status:'loading'`, stub methods throw), not on missing symbols.
- [ ] **Step 3: Write the stub** — `apps/web/lib/session.tsx`

```tsx
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

// GREEN obligation: fetch getCurrentUser on mount into {user,status}; implement
// login/signUp/logout/refresh (see the RED tests). The stub provides a resolvable
// context whose methods are unimplemented so useSession() works but behavior is RED.
export function SessionProvider({ children }: { children: ReactNode }) {
  const value: SessionContextValue = {
    user: null,
    status: 'loading',
    login: async () => { throw new Error('NotImplemented: session.login'); },
    signUp: async () => { throw new Error('NotImplemented: session.signUp'); },
    logout: async () => { throw new Error('NotImplemented: session.logout'); },
    refresh: async () => { throw new Error('NotImplemented: session.refresh'); }
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
```

- [ ] **Step 4: Confirm still RED + typecheck** — re-run the spec (FAIL on assertions, symbols resolve); `cd apps/web && pnpm typecheck` clean.
- [ ] **Step 5: Commit** — `git commit -m "skeleton(014): session context (RED + stub)"`

---

### Task 2: AppShell — `components/shell/AppShell.tsx`

**Files:**
- Stub: `apps/web/components/shell/AppShell.tsx`
- Test: `apps/web/components/shell/AppShell.spec.tsx` (RED)

**Interfaces:**
- Consumes: `useSession` from `@/lib/session`; `usePathname` from `next/navigation`; `CurrentUser` (via session).
- Produces: `export function AppShell(props: { children: ReactNode }): JSX.Element;`

**GREEN obligation:** render a top bar — brand link → `/photos`; horizontal nav with exactly `Photos` (`/photos`), `Clusters` (`/clusters`), `Usage` (`/usage`), the link matching the current pathname carrying `aria-current="page"`; a user menu showing `useSession().user.displayName` and a `Log out` control that calls `useSession().logout`. Render `{children}` below the bar. Visual form is exploratory (smoke-covered) — pin only the obligations in the tests.

- [ ] **Step 1: Write the RED tests** — `apps/web/components/shell/AppShell.spec.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { AppShell } from '@/components/shell/AppShell';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const usePathname = vi.fn();
vi.mock('next/navigation', () => ({ usePathname: () => usePathname() }));

const logout = vi.fn();
beforeEach(() => {
  logout.mockReset();
  usePathname.mockReturnValue('/photos');
  vi.mocked(session.useSession).mockReturnValue({
    user: { userId: 'u1', email: 'a@b.co', displayName: 'Ada' },
    status: 'authenticated',
    login: vi.fn(), signUp: vi.fn(), logout, refresh: vi.fn()
  });
});

describe('AppShell', () => {
  it('renders the three nav links with their hrefs', () => {
    // why: Clusters was unreachable before; the shell must expose all three
    render(<AppShell><p>section</p></AppShell>);
    expect(screen.getByRole('link', { name: 'Photos' })).toHaveAttribute('href', '/photos');
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('href', '/clusters');
    expect(screen.getByRole('link', { name: 'Usage' })).toHaveAttribute('href', '/usage');
  });

  it('marks the active route with aria-current=page', () => {
    // why: active-state is the nav's core feedback; pinned as an a11y contract
    usePathname.mockReturnValue('/clusters');
    render(<AppShell><p>section</p></AppShell>);
    expect(screen.getByRole('link', { name: 'Clusters' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Photos' })).not.toHaveAttribute('aria-current', 'page');
  });

  it('shows the display name and renders children', () => {
    render(<AppShell><p>section-body</p></AppShell>);
    expect(screen.getByText('Ada')).toBeTruthy();
    expect(screen.getByText('section-body')).toBeTruthy();
  });

  it('logs out via the session when Log out is clicked', async () => {
    // why: the shell is the one place a logged-in user can sign out anywhere
    render(<AppShell><p>section</p></AppShell>);
    fireEvent.click(screen.getByRole('button', { name: /log out/i }));
    await waitFor(() => expect(logout).toHaveBeenCalledTimes(1));
  });
});
```

- [ ] **Step 2: Run to confirm RED** — `pnpm vitest run components/shell/AppShell.spec.tsx` — FAIL: stub renders only children, no links/user-menu.
- [ ] **Step 3: Write the stub** — `apps/web/components/shell/AppShell.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';

// GREEN obligation: top bar (brand→/photos, nav Photos·Clusters·Usage with
// aria-current on the active link, user menu displayName + Log out→session.logout)
// then {children}. Stub renders only children so the nav/user-menu tests are RED.
export function AppShell({ children }: { children: ReactNode }) {
  return <div data-appshell-stub>{children}</div>;
}
```

- [ ] **Step 4: Confirm still RED + typecheck.**
- [ ] **Step 5: Commit** — `skeleton(014): AppShell (RED + stub)`

---

### Task 3: AuthGuard — `components/shell/AuthGuard.tsx`

**Files:**
- Stub: `apps/web/components/shell/AuthGuard.tsx`
- Test: `apps/web/components/shell/AuthGuard.spec.tsx` (RED)

**Interfaces:**
- Consumes: `useSession` from `@/lib/session`; `useRouter` from `next/navigation`.
- Produces: `export function AuthGuard(props: { children: ReactNode }): JSX.Element | null;`

**GREEN obligation:** read `useSession().status`. `'loading'` → render a non-blocking loading state (no children, no redirect). `'anonymous'` → `useRouter().replace('/login')` (in an effect) and render no children. `'authenticated'` → render `{children}`.

- [ ] **Step 1: Write the RED tests** — `apps/web/components/shell/AuthGuard.spec.tsx`

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { AuthGuard } from '@/components/shell/AuthGuard';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

function mockStatus(status: session.SessionStatus) {
  vi.mocked(session.useSession).mockReturnValue({
    user: status === 'authenticated' ? { userId: 'u', email: 'e', displayName: 'Ada' } : null,
    status, login: vi.fn(), signUp: vi.fn(), logout: vi.fn(), refresh: vi.fn()
  });
}
beforeEach(() => replace.mockReset());

describe('AuthGuard', () => {
  it('renders children when authenticated', () => {
    mockStatus('authenticated');
    render(<AuthGuard><p>secret</p></AuthGuard>);
    expect(screen.getByText('secret')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects to /login and hides children when anonymous', async () => {
    // why: guarded sections must never render for a signed-out visitor
    mockStatus('anonymous');
    render(<AuthGuard><p>secret</p></AuthGuard>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/login'));
    expect(screen.queryByText('secret')).toBeNull();
  });

  it('shows neither children nor a redirect while loading', () => {
    // why: don't flash /login before the session resolves
    mockStatus('loading');
    render(<AuthGuard><p>secret</p></AuthGuard>);
    expect(screen.queryByText('secret')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to confirm RED** — FAIL: stub renders a placeholder (children hidden even when authenticated; no redirect when anonymous).
- [ ] **Step 3: Write the stub** — `apps/web/components/shell/AuthGuard.tsx`

```tsx
'use client';

import type { ReactNode } from 'react';

// GREEN obligation: gate on useSession().status — loading → loading state;
// anonymous → useRouter().replace('/login') + no children; authenticated →
// {children}. Stub renders an inert placeholder so all three cases are RED.
export function AuthGuard({ children }: { children: ReactNode }) {
  void children;
  return <div data-authguard-stub />;
}
```

- [ ] **Step 4: Confirm still RED + typecheck.**
- [ ] **Step 5: Commit** — `skeleton(014): AuthGuard (RED + stub)`

---

### Task 4: LoginScreen — `components/auth/LoginScreen.tsx`

**Files:**
- Stub: `apps/web/components/auth/LoginScreen.tsx`
- Test: `apps/web/components/auth/LoginScreen.spec.tsx` (RED)

**Interfaces:**
- Consumes: `useSession` from `@/lib/session`.
- Produces: `export function LoginScreen(): JSX.Element;`

**GREEN obligation:** render a log-in form (email + password) and a sign-up form (display name + email + password) on shadcn primitives. Submitting log-in calls `useSession().login(email, password)`; submitting sign-up calls `useSession().signUp(email, password, displayName)`. A rejected call shows an inline error message (`role="alert"`). No redirect here — the `/login` page redirects once `status` becomes `authenticated` (Task 6). Visual layout is exploratory (smoke-covered).

- [ ] **Step 1: Write the RED tests** — `apps/web/components/auth/LoginScreen.spec.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import { LoginScreen } from '@/components/auth/LoginScreen';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
const login = vi.fn();
const signUp = vi.fn();
beforeEach(() => {
  login.mockReset().mockResolvedValue(undefined);
  signUp.mockReset().mockResolvedValue(undefined);
  vi.mocked(session.useSession).mockReturnValue({
    user: null, status: 'anonymous', login, signUp, logout: vi.fn(), refresh: vi.fn()
  });
});

describe('LoginScreen', () => {
  it('logs in with the entered credentials', async () => {
    // why: login submits through the session context, not lib/api directly
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/^e-?mail$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    await waitFor(() => expect(login).toHaveBeenCalledWith('a@b.co', 'pw'));
  });

  it('signs up with display name, email and password', async () => {
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/display name/i), { target: { value: 'Ada' } });
    fireEvent.change(screen.getByLabelText(/sign-?up e-?mail/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/sign-?up password/i), { target: { value: 'pw' } });
    fireEvent.click(screen.getByRole('button', { name: /sign up/i }));
    await waitFor(() => expect(signUp).toHaveBeenCalledWith('a@b.co', 'pw', 'Ada'));
  });

  it('shows an inline error when login fails', async () => {
    // why: bad credentials must surface, not fail silently
    login.mockRejectedValue(new Error('bad creds'));
    render(<LoginScreen />);
    fireEvent.change(screen.getByLabelText(/^e-?mail$/i), { target: { value: 'a@b.co' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: /^log in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/bad creds/i);
  });
});
```

- [ ] **Step 2: Run to confirm RED** — FAIL: stub has no forms/inputs.
- [ ] **Step 3: Write the stub** — `apps/web/components/auth/LoginScreen.tsx`

```tsx
'use client';

// GREEN obligation: log-in form (email, password → session.login) + sign-up form
// (display name, email, password → session.signUp) on shadcn primitives, with an
// inline role="alert" error on failure. Stub renders a placeholder (forms RED).
export function LoginScreen() {
  return <div data-loginscreen-stub />;
}
```

- [ ] **Step 4: Confirm still RED + typecheck.**
- [ ] **Step 5: Commit** — `skeleton(014): LoginScreen (RED + stub)`

---

### Task 5: PhotosPage — `components/photos/PhotosPage.tsx`

**Files:**
- Stub: `apps/web/components/photos/PhotosPage.tsx`
- Test: `apps/web/components/photos/PhotosPage.spec.tsx` (RED)

**Interfaces:**
- Consumes: `createUploadIntent`, `uploadFileToPresignedUrl`, `completeUpload` from `@/lib/api`; `PhotoGallery` from `@/components/gallery/PhotoGallery`.
- Produces: `export function PhotosPage(): JSX.Element;`

**GREEN obligation:** host the existing `PhotoGallery` plus the upload action moved verbatim from the old `app/page.tsx` — a file input + Upload button that runs `createUploadIntent → uploadFileToPresignedUrl → completeUpload`, then bumps a `reloadToken` passed to `<PhotoGallery reloadToken>` so the new photo appears. No gallery-internal changes.

- [ ] **Step 1: Write the RED tests** — `apps/web/components/photos/PhotosPage.spec.tsx`

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '@/lib/api';
import { PhotosPage } from '@/components/photos/PhotosPage';

vi.mock('@/lib/api', () => ({
  createUploadIntent: vi.fn(),
  uploadFileToPresignedUrl: vi.fn(),
  completeUpload: vi.fn(),
  listPhotos: vi.fn().mockResolvedValue({ photos: [], totalCount: 0 })
}));

beforeEach(() => {
  vi.mocked(api.createUploadIntent).mockResolvedValue({ photoId: 'p1', uploadUrl: 'http://minio/put' });
  vi.mocked(api.uploadFileToPresignedUrl).mockResolvedValue(undefined);
  vi.mocked(api.completeUpload).mockResolvedValue({} as api.PhotoAsset);
});

describe('PhotosPage', () => {
  it('renders the gallery (its empty state)', async () => {
    render(<PhotosPage />);
    expect(await screen.findByText(/no photos/i)).toBeTruthy();
  });

  it('runs the three-step upload for a chosen file', async () => {
    // why: upload moved verbatim from the home dump — the flow must survive intact
    render(<PhotosPage />);
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    const input = screen.getByLabelText(/upload/i) as HTMLInputElement;
    fireEvent.change(input, { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    await waitFor(() => expect(api.createUploadIntent).toHaveBeenCalledWith(file));
    await waitFor(() => expect(api.uploadFileToPresignedUrl).toHaveBeenCalledWith('http://minio/put', file));
    await waitFor(() => expect(api.completeUpload).toHaveBeenCalledWith('p1'));
  });
});
```

- [ ] **Step 2: Run to confirm RED** — FAIL: stub renders neither gallery nor upload control.
- [ ] **Step 3: Write the stub** — `apps/web/components/photos/PhotosPage.tsx`

```tsx
'use client';

// GREEN obligation: render <PhotoGallery reloadToken> + the upload action moved
// verbatim from the old app/page.tsx (createUploadIntent → uploadFileToPresignedUrl
// → completeUpload, then bump reloadToken). Stub renders a placeholder (RED).
export function PhotosPage() {
  return <div data-photospage-stub />;
}
```

- [ ] **Step 4: Confirm still RED + typecheck.**
- [ ] **Step 5: Commit** — `skeleton(014): PhotosPage (RED + stub)`

---

### Task 6: Route restructure & wiring (architecture-sensitive: routing + guard placement)

Wires the components into the App Router, moves the sections under an `(app)` route group, retires the `.panel` era, and vacates the home dump. Landing-redirect files (`app/page.tsx`, `app/login/page.tsx`) carry behavior stubs + RED tests; the composition/re-export files (`(app)/layout.tsx`, the three `(app)/*/page.tsx`, `app/layout.tsx`) are thin wiring, covered by light render tests.

**Files:**
- Modify: `apps/web/app/layout.tsx` (wrap children in `<SessionProvider>`; update `metadata`)
- Stub → replace: `apps/web/app/page.tsx` (was HomePage; now `redirect('/photos')`)
- Rewrite test: `apps/web/app/page.spec.tsx` (was the HomePage alert test → the redirect test) — **needs `Allow-test-removal:` trailer**
- New: `apps/web/app/login/page.tsx` + `apps/web/app/login/page.spec.tsx` (RED)
- New: `apps/web/app/(app)/layout.tsx` + `apps/web/app/(app)/layout.spec.tsx`
- New: `apps/web/app/(app)/photos/page.tsx` + `apps/web/app/(app)/photos/page.spec.tsx`
- Move: `apps/web/app/clusters/page.tsx` → `apps/web/app/(app)/clusters/page.tsx`; `apps/web/app/clusters/page.spec.tsx` → `apps/web/app/(app)/clusters/page.spec.tsx` (fix imports to `@/`)
- Move: `apps/web/app/usage/page.tsx` → `apps/web/app/(app)/usage/page.tsx`; add `apps/web/app/(app)/usage/page.spec.tsx` (new — no prior page test)
- Modify: `apps/web/app/globals.css` (delete the `.panel` rule, retired with the home dump)

**Interfaces:**
- Consumes: `SessionProvider`/`useSession` (Task 1), `AppShell` (Task 2), `AuthGuard` (Task 3), `LoginScreen` (Task 4), `PhotosPage` (Task 5), `redirect`/`useRouter` from `next/navigation`, `ClusterView`, `UsageReport`.
- Produces: the route tree `/` → `/photos`; `(app)/{photos,clusters,usage}` under guard+shell; bare `/login`.

**GREEN obligation:** `app/page.tsx` calls `redirect('/photos')`. `app/login/page.tsx`: if `useSession().status === 'authenticated'` → `useRouter().replace('/photos')`; else render `<LoginScreen/>`. `app/(app)/layout.tsx`: `<AuthGuard><AppShell>{children}</AppShell></AuthGuard>`. The three `(app)/*/page.tsx` re-export `PhotosPage` / `ClusterView` / `UsageReport`. `app/layout.tsx` wraps `{children}` in `<SessionProvider>`.

- [ ] **Step 1: Write the RED / wiring tests.**

`apps/web/app/page.spec.tsx` (rewritten — replaces the HomePage alert test):
```tsx
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RootPage from './page';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

describe('RootPage', () => {
  it('redirects to /photos', () => {
    // why: / is not a page anymore — Photos is the app's home section
    try { render(<RootPage />); } catch { /* redirect() throws in real Next; here it's mocked */ }
    expect(redirect).toHaveBeenCalledWith('/photos');
  });
});
```

`apps/web/app/login/page.spec.tsx`:
```tsx
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as session from '@/lib/session';
import LoginPage from './page';

vi.mock('@/lib/session', () => ({ useSession: vi.fn() }));
vi.mock('@/components/auth/LoginScreen', () => ({ LoginScreen: () => <div>login-screen</div> }));
const replace = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace, push: vi.fn() }) }));

function mockStatus(status: session.SessionStatus) {
  vi.mocked(session.useSession).mockReturnValue({
    user: null, status, login: vi.fn(), signUp: vi.fn(), logout: vi.fn(), refresh: vi.fn()
  });
}
beforeEach(() => replace.mockReset());

describe('LoginPage', () => {
  it('renders the login screen for an anonymous visitor', () => {
    mockStatus('anonymous');
    render(<LoginPage />);
    expect(screen.getByText('login-screen')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it('redirects an already-authenticated visitor to /photos', async () => {
    // why: a logged-in user should never sit on /login
    mockStatus('authenticated');
    render(<LoginPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/photos'));
  });
});
```

`apps/web/app/(app)/layout.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import AppLayout from './layout';

vi.mock('@/components/shell/AuthGuard', () => ({ AuthGuard: ({ children }: { children: React.ReactNode }) => <div data-guard>{children}</div> }));
vi.mock('@/components/shell/AppShell', () => ({ AppShell: ({ children }: { children: React.ReactNode }) => <div data-shell>{children}</div> }));

describe('(app) layout', () => {
  it('wraps children in the guard then the shell', () => {
    // why: the guard must sit OUTSIDE the shell so anonymous users never see it
    const { container } = render(<AppLayout><p>body</p></AppLayout>);
    expect(container.querySelector('[data-guard] [data-shell]')).toBeTruthy();
    expect(screen.getByText('body')).toBeTruthy();
  });
});
```

`apps/web/app/(app)/photos/page.spec.tsx`:
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PhotosRoute from './page';

vi.mock('@/components/photos/PhotosPage', () => ({ PhotosPage: () => <div>photos-page</div> }));

describe('/photos route', () => {
  it('renders PhotosPage', () => {
    render(<PhotosRoute />);
    expect(screen.getByText('photos-page')).toBeTruthy();
  });
});
```

`apps/web/app/(app)/clusters/page.spec.tsx` (moved; imports fixed to `@/`):
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClustersPage from './page';

vi.mock('@/lib/api', () => ({
  listClusteringMethods: vi.fn().mockResolvedValue({ methods: [] }),
  listClusteringResults: vi.fn().mockResolvedValue({ results: [] }),
  getClusteringResult: vi.fn(),
  generateClusters: vi.fn()
}));

describe('ClustersPage', () => {
  it('renders the ClusterView', async () => {
    render(<ClustersPage />);
    expect(await screen.findByText('Generate clusters')).toBeTruthy();
  });
});
```

`apps/web/app/(app)/usage/page.spec.tsx` (new):
```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import UsagePage from './page';

vi.mock('@/components/usage/UsageReport', () => ({ UsageReport: () => <div>usage-report</div> }));

describe('UsagePage', () => {
  it('renders the UsageReport', () => {
    render(<UsagePage />);
    expect(screen.getByText('usage-report')).toBeTruthy();
  });
});
```

`apps/web/app/layout.spec.tsx` (new — covers the SessionProvider wrap):
```tsx
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import RootLayout from './layout';

vi.mock('@/lib/session', () => ({
  SessionProvider: ({ children }: { children: React.ReactNode }) => <div data-session-provider>{children}</div>
}));

describe('RootLayout', () => {
  it('wraps children in the SessionProvider', () => {
    const html = renderToStaticMarkup(<RootLayout><p>child</p></RootLayout>);
    expect(html).toContain('data-session-provider');
    expect(html).toContain('child');
  });
});
```

- [ ] **Step 2: Run to confirm RED** — the behavior specs (`app/page.spec`, `app/login/page.spec`) FAIL against stubs; the wiring specs pass once their (real) wiring files exist in Step 3. Run `pnpm vitest run app` and confirm the two behavior specs are RED for the right reason.
- [ ] **Step 3: Write the stubs + wiring files.**

`apps/web/app/page.tsx` (behavior stub):
```tsx
// GREEN obligation: redirect('/photos'). Stub throws so the redirect test is RED.
export default function RootPage() {
  throw new Error('NotImplemented: RootPage should redirect to /photos');
}
```

`apps/web/app/login/page.tsx` (behavior stub):
```tsx
'use client';

// GREEN obligation: status==='authenticated' → useRouter().replace('/photos');
// else render <LoginScreen/>. Stub throws so both cases are RED.
export default function LoginPage() {
  throw new Error('NotImplemented: LoginPage');
}
```

`apps/web/app/(app)/layout.tsx` (wiring — real):
```tsx
import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/shell/AuthGuard';
import { AppShell } from '@/components/shell/AppShell';

// Authenticated route group: guard OUTSIDE shell so a signed-out visitor is
// redirected before any chrome renders.
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <AppShell>{children}</AppShell>
    </AuthGuard>
  );
}
```

`apps/web/app/(app)/photos/page.tsx` (wiring — real):
```tsx
import { PhotosPage } from '@/components/photos/PhotosPage';

// /photos — the gallery + upload action (moved out of the old home dump).
export default function PhotosRoute() {
  return <PhotosPage />;
}
```

`apps/web/app/(app)/clusters/page.tsx` (moved; import fixed to `@/`):
```tsx
import { ClusterView } from '@/components/clusters/ClusterView';

// /clusters — the photo-clustering plane (session 013), now reachable from the nav.
export default function ClustersPage() {
  return <ClusterView />;
}
```

`apps/web/app/(app)/usage/page.tsx` (moved; import fixed to `@/`):
```tsx
import { UsageReport } from '@/components/usage/UsageReport';

// /usage — the itemized usage report page (session 012 add-on).
export default function UsagePage() {
  return <UsageReport />;
}
```

`apps/web/app/layout.tsx` (modified):
```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';

export const metadata = {
  title: 'PhotoOps',
  description: 'Photo management — upload, gallery, clustering, usage'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
```

Delete moved originals: `git rm apps/web/app/clusters/page.tsx apps/web/app/clusters/page.spec.tsx apps/web/app/usage/page.tsx`. Delete the `.panel` block from `apps/web/app/globals.css`.

- [ ] **Step 4: Confirm still RED + typecheck + no dangling refs** — `pnpm vitest run app` (behavior specs RED, wiring specs green), `pnpm typecheck` clean, `grep -rn "panel" apps/web/app` empty, `grep -rn "app/clusters\|app/usage\b" apps/web` shows no stale path imports.
- [ ] **Step 5: Commit** — `skeleton(014): route restructure + shell wiring (RED + stubs)` with a body line `Allow-test-removal: HomePage alert test replaced by RootPage redirect test (home page becomes a redirect); clusters page.spec moved under (app) route group` (test-guard `mp0`).

---

### Task 7: Live UI smoke (dqb — user-facing, gateway-crossing)

Not a vitest test (excluded from coverage). Extends `make smoke-ui` to prove the shell + guard + login redirect work on a live stack, per the design's acceptance smoke.

**Files:**
- Modify: `apps/web/smoke/gallery.smoke.ts` (sign-up now happens on `/login` and lands on `/photos`)
- New: `apps/web/smoke/shell.smoke.ts` (nav + logout flow)

**GREEN obligation (run green before merge, not in `make gate`):**

`apps/web/smoke/gallery.smoke.ts` — update the flow: `page.goto('/')` still works (it redirects to `/login`), fill the sign-up form on `/login`, submit, then assert the gallery empty state renders on `/photos`. Keep the existing test title.

`apps/web/smoke/shell.smoke.ts` (new):
```ts
import { expect, test } from '@playwright/test';

// Live UI smoke for the app shell (session 014): a signed-up user lands on
// /photos, navigates the three sections via the nav, and logs out back to /login.
// Run via `make smoke-ui`. Proves guard redirect + shared logout + nav on a real
// stack (jsdom unit tests share the code's assumptions; dqb requires this).
test('shell: sign in, navigate sections, log out', async ({ page }) => {
  const email = `smoke-shell-${Date.now()}@example.com`;

  await page.goto('/'); // → /login (guard)
  await page.getByLabel(/display name/i).fill('Smoke Shell');
  await page.getByLabel(/sign-?up e-?mail/i).fill(email);
  await page.getByLabel(/sign-?up password/i).fill('smoke-password-123');
  await page.getByRole('button', { name: /sign up/i }).click();

  await expect(page).toHaveURL(/\/photos$/);
  await page.getByRole('link', { name: 'Clusters' }).click();
  await expect(page).toHaveURL(/\/clusters$/);
  await page.getByRole('link', { name: 'Usage' }).click();
  await expect(page).toHaveURL(/\/usage$/);
  await page.getByRole('link', { name: 'Photos' }).click();
  await expect(page).toHaveURL(/\/photos$/);

  await page.getByRole('button', { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login$/);
});
```

- [ ] **Step 1: Update `gallery.smoke.ts` for the `/login` entry point.**
- [ ] **Step 2: Add `shell.smoke.ts`.**
- [ ] **Step 3: Run** `make smoke-ui` against a live stack (deferred to pre-merge; requires `make dev`). Expected: both smokes green.
- [ ] **Step 4: Commit** — `test(014): live UI smoke for shell nav + logout`

---

## Post-skeleton (before human review)

- [ ] `cd apps/web && pnpm typecheck` clean; `pnpm vitest run` shows only the intended RED (behavior specs failing on assertions, wiring specs green).
- [ ] `make skeleton-gate` green (100% new/changed lines have a covering test). On fail → add the missing RED test (spec-change protocol), do not lower the bar.
- [ ] Update `apps/web/CLAUDE.md` (`## Local context` — the shell/session/route structure; `## Local invariants` — "auth reaches the app only via `useSession`; `SessionProvider` is the only caller of the `lib/api` auth endpoints") in the wiring commit.
- [ ] Hand the skeleton to human review (the exSDD approval checkpoint) before filling GREEN.
