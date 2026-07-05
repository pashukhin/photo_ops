# UI Polish & Web-Facing Bugfixes Skeleton Commit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to fill this skeleton task-by-task — each task makes its RED tests green within the provided stubs. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the known web-facing bugs (unbounded cluster poll, fragile gallery
polling, idle-broker publish failure) and polish each section (shell affordances,
usage report, a coherent light theme) — as a thin slice, no section redesign.

**Architecture / WHY:** Every item modifies an existing, working unit; the RED
test pins the *new* obligation on top of behavior the current code already
passes. Entry points: behavior → the `*.spec.tsx` / `test_*.py` files named per
task; the design → `docs/superpowers/specs/2026-07-05-ui-polish-and-web-bugfixes-design.md`.
The one non-web item (`di8`) gains an injectable connection factory so its
reconnect logic is unit-testable without a live broker; the real pika connect
stays `# pragma: no cover` and is exercised by `make smoke-cluster`.

**Tech Stack:** Next.js/React + TypeScript (vitest + @testing-library/react,
jsdom); Python 3.12 cluster-service (pytest); Tailwind v4 + shadcn/ui.

## Global Constraints

- Web behavior tests: vitest in jsdom, `vi.mock('../../lib/api')` (or `@/lib/api`),
  fake timers via `vi.useFakeTimers()` + `act(async () => await vi.advanceTimersByTimeAsync(ms))`.
- New/changed code must reach 100% coverage (`make coverage-gate`); the skeleton
  must pass `make skeleton-gate` (RED tests execute every new/changed line) before
  human review.
- Test-integrity guard (`make test-guard`): do not weaken/delete/rename-away the
  existing RED tests these tasks add; removing any test needs an
  `Allow-test-removal:` trailer.
- Every commit ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- Live gates before merge: `make gate` + `make coverage-gate` + `make test-guard`
  + live `make smoke-ui` + live `make smoke-cluster`, then final `/code-review`.

## Non-Goals

- No dark-mode toggle / theme switcher; the `zv7` comfort pass is token-level only
  (coherent light theme) — no per-section visual redesign.
- No cluster-tree UI (covers/counts/publish-from-cluster) and no gallery internal
  redesign (the declined deeper chunk).
- `di8` is reconnect-on-publish ONLY; publish flow-control drain and cross-service
  topology constants stay open on `di8` (not built here).
- The `56l` mutation-handler DRY (fold the 3 session mutations) is NOT done — the
  bd note gates it on a 4th handler landing; it has not.
- No behavior RED test for the usage Combobox (jsdom-hostile) or the `zv7` theme —
  both are the visual lane (smoke + manual).

---

### Task 1: Bound the cluster generate() poll (`n7w`)

**Files:**
- Modify: `apps/web/components/clusters/ClusterView.tsx` (add `CLUSTER_POLL_MAX_ATTEMPTS`; bound the `while (result.status === 'pending')` loop at lines 84-87)
- Test: `apps/web/components/clusters/ClusterView.spec.tsx` (add one RED test)

**Interfaces:**
- Produces: `export const CLUSTER_POLL_MAX_ATTEMPTS: number` (alongside the existing `CLUSTER_POLL_MS`).

**GREEN obligation (for the implementer):** when the poll reaches
`CLUSTER_POLL_MAX_ATTEMPTS` while still `pending`, stop polling, clear
`generating`, and surface a user-facing timeout error via the existing `error`
state (message must contain "timed out"). Do not change the settle-fast path.

- [ ] **Step 1: Write the RED test** in `ClusterView.spec.tsx`:

```tsx
it('stops polling and surfaces a timeout when a run never leaves pending', async () => {
  // why: a stuck-PENDING run (worker down / DLQ) must fail with an error, not spin forever
  vi.useFakeTimers();
  vi.mocked(api.getClusteringResult).mockResolvedValue({ ...TREE, status: 'pending', root: null });
  render(<ClusterView />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); // methods + results load
  fireEvent.click(screen.getByText('Generate clusters'));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(CLUSTER_POLL_MS * (CLUSTER_POLL_MAX_ATTEMPTS + 2));
  });
  expect(screen.getByText(/timed out/i)).toBeTruthy();
  // bounded: the poll did not run away
  expect(vi.mocked(api.getClusteringResult).mock.calls.length).toBeLessThanOrEqual(CLUSTER_POLL_MAX_ATTEMPTS + 2);
  vi.useRealTimers();
});
```
Add `CLUSTER_POLL_MAX_ATTEMPTS` to the existing `import { CLUSTER_POLL_MS } from './ClusterView'` line (import `CLUSTER_POLL_MS, CLUSTER_POLL_MAX_ATTEMPTS`).

- [ ] **Step 2: Run to confirm RED** — `npx vitest run components/clusters/ClusterView.spec.tsx` (from `apps/web`). Expected: FAIL — no element matches `/timed out/i` (the loop never surfaces a timeout). NOT a hang (see the stub seam below) and NOT an import error.

- [ ] **Step 3: Write the stub seam** in `ClusterView.tsx` — add the const and a bounded loop whose cap branch throws a not-implemented sentinel (so the test fails cleanly instead of hanging, and existing tests that settle fast are untouched):

```tsx
export const CLUSTER_POLL_MAX_ATTEMPTS = 30;
// inside generate(), replace the while loop:
let attempts = 0;
let result = await getClusteringResult(resultId);
while (result.status === 'pending') {
  if (attempts >= CLUSTER_POLL_MAX_ATTEMPTS) {
    throw new Error('NOT_IMPLEMENTED: poll timeout'); // GREEN: surface a "timed out" error instead
  }
  attempts += 1;
  await new Promise((resolve) => setTimeout(resolve, CLUSTER_POLL_MS));
  result = await getClusteringResult(resultId);
}
```

- [ ] **Step 4: Confirm still RED + typecheck** — re-run the test: FAIL on the missing `/timed out/i` (the sentinel is caught by the existing `catch` → shows `NOT_IMPLEMENTED`, not "timed out"). The existing "polls a pending result until it is ready" test still PASSES (settles before the cap). Run `npx tsc --noEmit`.

- [ ] **Step 5: Commit** — `git add apps/web/components/clusters/ClusterView.{tsx,spec.tsx} && git commit -m "skeleton(n7w): bound ClusterView generate poll (RED + stub)"`

---

### Task 2: Harden gallery polling + DRY (`gfs`)

**Files:**
- Stub: `apps/web/components/gallery/format.ts` (new; shared formatting helpers, bodies throw)
- Test: `apps/web/components/gallery/format.spec.ts` (new; RED)
- Modify: `apps/web/components/gallery/types.ts` (add poll-bound consts)
- Test: `apps/web/components/gallery/PhotoGallery.spec.tsx` (add RED tests for poll edges + modal error)

**Interfaces:**
- Produces (`format.ts`): `export const FALLBACK = '—'`; `export function fmt(val: string | number | undefined | null): string`; `export function fmtBytes(sizeBytes: string | undefined): string`; `export function fmtDimensions(w?: number, h?: number): string`.
- Produces (`types.ts`): `export const GALLERY_POLL_MAX_ERRORS: number` (consecutive transient-error cap); `export const GALLERY_POLL_MAX_TICKS: number` (stuck-status cap).
- Consumes: `GALLERY_POLL_MS` (existing, `types.ts`).

**GREEN obligation (for the implementer):** (a) a transient poll error must NOT
stop polling — tolerate up to `GALLERY_POLL_MAX_ERRORS` consecutive failures,
resetting the counter on success; (b) stop polling after `GALLERY_POLL_MAX_TICKS`
ticks even if nothing settles; (c) drop a stale poll response whose page/query no
longer matches the current one (generation guard); (d) `PhotoDetailModal` shows a
`getPhoto` error in the dialog; (e) `PhotoTable` and `PhotoDetailModal` import
`FALLBACK`/`fmt`/`fmtBytes`/`fmtDimensions` from `format.ts` (delete the local
copies) with no behavior change to the existing gallery tests.

- [ ] **Step 1: Write the RED tests.**

`format.spec.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { FALLBACK, fmt, fmtBytes, fmtDimensions } from './format';

describe('gallery format helpers', () => {
  it('fmt falls back for empty/nullish and stringifies otherwise', () => {
    expect(fmt('')).toBe(FALLBACK);       // why: absent attribute → em-dash, not blank
    expect(fmt(null)).toBe(FALLBACK);
    expect(fmt(42)).toBe('42');
  });
  it('fmtBytes renders human units and falls back on non-numeric', () => {
    expect(fmtBytes(undefined)).toBe(FALLBACK);
    expect(fmtBytes('512')).toBe('512 B');
    expect(fmtBytes('2048')).toBe('2.0 KB');
    expect(fmtBytes(String(3 * 1024 * 1024))).toBe('3.0 MB');
  });
  it('fmtDimensions needs both sides', () => {
    expect(fmtDimensions(undefined, 3)).toBe(FALLBACK);
    expect(fmtDimensions(4000, 3000)).toBe('4000×3000');
  });
});
```

`PhotoGallery.spec.tsx` — add (reuse the existing `PROCESSING_PHOTO`/`READY_PHOTO`, import `GALLERY_POLL_MAX_TICKS` from `./types`):
```tsx
it('keeps polling after a transient poll error (does not stop on the first failure)', async () => {
  // why: one flaky fetch must not silently freeze the table forever
  vi.useFakeTimers();
  vi.mocked(api.listPhotos)
    .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // initial
    .mockRejectedValueOnce(new Error('transient'))                        // poll 1 fails
    .mockResolvedValueOnce({ photos: [PROCESSING_PHOTO], totalCount: 1 }) // poll 2 ok, still processing
    .mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });         // poll 3 settles
  render(<PhotoGallery />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * 3); });
  expect(api.listPhotos).toHaveBeenCalledTimes(4); // initial + 3 polls, error did not abort
  vi.useRealTimers();
});

it('stops polling a never-settling status after the tick cap', async () => {
  // why: a stuck 'processing' (worker down) must not poll forever
  vi.useFakeTimers();
  vi.mocked(api.listPhotos).mockResolvedValue({ photos: [PROCESSING_PHOTO], totalCount: 1 });
  render(<PhotoGallery />);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  await act(async () => { await vi.advanceTimersByTimeAsync(GALLERY_POLL_MS * (GALLERY_POLL_MAX_TICKS + 10)); });
  // initial + at most MAX_TICKS polls, not MAX_TICKS+10
  expect(vi.mocked(api.listPhotos).mock.calls.length).toBeLessThanOrEqual(GALLERY_POLL_MAX_TICKS + 1);
  vi.useRealTimers();
});

it('shows an error in the detail dialog when getPhoto fails', async () => {
  // why: the modal must not open blank/silent on a failed detail fetch
  vi.mocked(api.listPhotos).mockResolvedValue({ photos: [READY_PHOTO], totalCount: 1 });
  vi.mocked(api.getPhoto).mockRejectedValue(new Error('detail boom'));
  render(<PhotoGallery />);
  fireEvent.click(await screen.findByText('beach.jpg'));
  const dialog = await screen.findByRole('dialog');
  await waitFor(() => expect(within(dialog).getByText(/boom|error|failed/i)).toBeTruthy());
});
```
(The stale-response race is covered by the tick-cap + transient tests plus the generation guard added in GREEN; a dedicated race test is optional and may be added by the implementer.)

- [ ] **Step 2: Run to confirm RED** — `npx vitest run components/gallery/format.spec.ts components/gallery/PhotoGallery.spec.tsx`. Expected FAILs: `format.spec` — module throws `NotImplementedError`; transient-poll test — only 2 calls (current code `clearInterval` on the first error); tick-cap test — call count `> MAX_TICKS+1` (unbounded today); modal test — no error text (errors swallowed).

- [ ] **Step 3: Write the stubs.**

`format.ts`:
```ts
export const FALLBACK = '—';
export function fmt(_val: string | number | undefined | null): string {
  throw new Error('NotImplementedError'); // GREEN: '' | null | undefined → FALLBACK, else String(val)
}
export function fmtBytes(_sizeBytes: string | undefined): string {
  throw new Error('NotImplementedError'); // GREEN: B / KB / MB, FALLBACK on non-numeric
}
export function fmtDimensions(_w?: number, _h?: number): string {
  throw new Error('NotImplementedError'); // GREEN: `${w}×${h}` when both present, else FALLBACK
}
```

`types.ts` — append:
```ts
export const GALLERY_POLL_MAX_ERRORS = 3;
export const GALLERY_POLL_MAX_TICKS = 60;
```
(`PhotoGallery.tsx` is intentionally NOT changed in the skeleton — the RED poll tests fail against the current polling code; GREEN rewrites the poll effect to use these caps + a generation guard.)

- [ ] **Step 4: Confirm still RED + typecheck** — re-run: `format.spec` FAILs on assertions (symbols resolve, bodies throw); poll tests FAIL on counts; modal test FAILs on missing error text. All existing gallery tests still PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add apps/web/components/gallery/format.ts apps/web/components/gallery/format.spec.ts apps/web/components/gallery/types.ts apps/web/components/gallery/PhotoGallery.spec.tsx && git commit -m "skeleton(gfs): gallery poll hardening + format util (RED + stubs)"`

---

### Task 3: Shell polish (`56l`)

**Files:**
- Modify: `apps/web/lib/session.tsx` (log the swallowed `getCurrentUser` error)
- Modify: `apps/web/components/shell/AuthGuard.tsx` (loading affordance instead of `null`)
- Modify: `apps/web/components/shell/AppShell.tsx` (surface logout failure)
- Test: `apps/web/lib/session.spec.tsx`, `apps/web/components/shell/AuthGuard.spec.tsx`, `apps/web/components/shell/AppShell.spec.tsx` (one RED each)

**Interfaces:** no new exported symbols; behavior-only changes to existing components.

**GREEN obligation (for the implementer):** (1) `session.tsx` `catch` calls
`console.warn` (once) before degrading to anonymous — and the existing
"treats a failed session fetch as anonymous" test spies/suppresses it to keep
output pristine; (2) `AuthGuard` `loading` renders a non-blocking affordance
(`role="status"`, text `/loading/i`), still no children and no redirect;
(3) `AppShell` awaits `logout()` and, on rejection, shows user feedback
(`role="alert"`, text `/log ?out/i` + failure wording).

- [ ] **Step 1: Write the RED tests.**

`session.spec.tsx`:
```tsx
it('logs a warning when the session fetch fails (outage != signed-out silently)', async () => {
  // why: a gateway/auth outage currently looks identical to signed-out; log it
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.mocked(api.getCurrentUser).mockRejectedValue(new Error('gateway down'));
  render(<Probe />, { wrapper });
  await waitFor(() => expect(screen.getByText('status:anonymous;user:none')).toBeTruthy());
  expect(warn).toHaveBeenCalled();
  warn.mockRestore();
});
```
Also update the existing "treats a failed session fetch as anonymous" test to add `const warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); ... warn.mockRestore();` so GREEN's warn does not dirty test output.

`AuthGuard.spec.tsx`:
```tsx
it('shows a non-blocking loading affordance while loading', () => {
  // why: a blank screen during session resolve reads as broken; show a loading state
  mockStatus('loading');
  render(<AuthGuard><p>secret</p></AuthGuard>);
  expect(screen.getByRole('status')).toHaveTextContent(/loading/i);
  expect(screen.queryByText('secret')).toBeNull(); // still no children, no redirect
  expect(replace).not.toHaveBeenCalled();
});
```

`AppShell.spec.tsx`:
```tsx
it('surfaces feedback when logout fails', async () => {
  // why: 'void logout()' drops a rejection silently; a failed logout must be visible
  logout.mockRejectedValue(new Error('logout failed'));
  render(<AppShell><p>section</p></AppShell>);
  fireEvent.click(screen.getByRole('button', { name: /log out/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent(/log ?out/i);
});
```

- [ ] **Step 2: Run to confirm RED** — `npx vitest run lib/session.spec.tsx components/shell/AuthGuard.spec.tsx components/shell/AppShell.spec.tsx`. Expected FAILs: warn not called; no `role="status"`; no `role="alert"` after logout.

- [ ] **Step 3: Write the stubs.** No stub bodies needed — these are behavior additions to existing components; the current code is the "stub" that fails the new assertions. (Leave `session.tsx` / `AuthGuard.tsx` / `AppShell.tsx` unchanged in the skeleton.)

- [ ] **Step 4: Confirm still RED + typecheck** — re-run the three specs: all three new tests FAIL for the reasons above; every existing shell/session test still PASSES. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add apps/web/lib/session.spec.tsx apps/web/components/shell/AuthGuard.spec.tsx apps/web/components/shell/AppShell.spec.tsx && git commit -m "skeleton(56l): shell polish obligations (RED tests)"`

---

### Task 4: Usage report polish — localized dates + filter-aware empty state (`rh0`)

**Files:**
- Modify: `apps/web/components/usage/UsageReport.tsx` (localized `occurredAt`; filter-aware empty state)
- Test: `apps/web/components/usage/UsageReport.spec.tsx` (add two RED tests)

**Interfaces:**
- Produces: `export function formatUsageDate(iso: string): string` (exported from `UsageReport.tsx`; deterministic — `Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' })`).

**GREEN obligation (for the implementer):** (1) render each line's `occurredAt`
through `formatUsageDate` (a medium localized date, not raw RFC3339); (2) when a
filter is active and 0 rows return, the empty state text is filter-aware
(contains "filter"). The Combobox upgrade is the visual lane — NOT part of this
task's RED.

- [ ] **Step 1: Write the RED tests** in `UsageReport.spec.tsx` (follow the file's existing `vi.mock('../../lib/api')` setup):

```tsx
it('renders occurred_at as a localized date, not raw RFC3339', () => {
  // why: raw '2026-06-15T09:30:00Z' is unreadable; show a localized date
  expect(formatUsageDate('2026-06-15T09:30:00Z')).toBe('Jun 15, 2026');
});

it('shows a filter-aware empty state when a filter yields no rows', async () => {
  // why: a free-form type that matches nothing must explain itself, not look empty-by-default
  vi.mocked(api.listUsageEvents).mockResolvedValue({ lines: [], totalCount: 0, filteredTotalAmount: '0.00', currency: 'USD' });
  vi.mocked(api.getUsageSummary).mockResolvedValue({ lines: [{ resourceType: 'storage', eventType: 'store', totalQuantity: '1', unit: 'byte' }], estimatedMonthlyCost: '0.00', currency: 'USD' });
  render(<UsageReport />);
  fireEvent.change(await screen.findByLabelText(/resource type/i), { target: { value: 'nope' } });
  expect(await screen.findByText(/filter/i)).toBeTruthy();
});
```
Import `formatUsageDate` from `./UsageReport`. (Match the summary/events mock shapes to `lib/api` types; adjust field names if the spec file already defines fixtures.)

- [ ] **Step 2: Run to confirm RED** — `npx vitest run components/usage/UsageReport.spec.tsx`. Expected FAILs: `formatUsageDate` is not exported (import error → implement stub next); empty-state text has no "filter".

- [ ] **Step 3: Write the stub** in `UsageReport.tsx`:
```tsx
export function formatUsageDate(_iso: string): string {
  throw new Error('NotImplementedError'); // GREEN: Intl medium date, UTC
}
```
(The filter-aware empty state is a GREEN edit to the existing `lines.length === 0` branch; no stub symbol needed.)

- [ ] **Step 4: Confirm still RED + typecheck** — re-run: date test FAILs on the thrown stub; empty-state test FAILs on missing `/filter/i`. Existing usage tests still PASS. `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit** — `git add apps/web/components/usage/UsageReport.tsx apps/web/components/usage/UsageReport.spec.tsx && git commit -m "skeleton(rh0): usage date + filter-aware empty state (RED + stub)"`

---

### Task 5: Visual comfort pass — coherent light theme (`zv7`) — VISUAL LANE

**Files:**
- Modify: `apps/web/app/globals.css` (remove the stray dark `body` override; comfort-tune tokens)
- Modify: `apps/web/components/clusters/ClusterView.tsx` (fold inline `paddingLeft` + `text-gray-500` onto Tailwind/token classes)

**No behavior RED test** — this is the visual lane (judgment call C). It is
verified by `make smoke-ui` (live render of every section) + manual exploration.
The existing structural tests (ClusterView.spec etc.) must remain green after the
className swaps (they assert text/roles, not styles).

**GREEN obligation (for the implementer):**
- Remove the unlayered `body { background: #101319; color: #f4f7fb }` override so
  the `@layer base` token-driven body wins → coherent light theme; keep a margin
  reset; use a comfortable system font stack.
- Light comfort-tune of the `:root` tokens (soft off-white `--background`,
  slightly warm neutral, consistent `--radius`/spacing/type rhythm). Leave the
  `.dark` token block defined but inert.
- Reconcile the global `main { max-width; margin; padding }` rule with the s014
  `AppShell` layout (avoid double-padding / width fights).
- In `ClusterView.tsx`, replace `style={{ paddingLeft: depth * 16 }}` and raw
  `text-gray-500` with Tailwind spacing + `text-muted-foreground`.

- [ ] **Step 1: (skeleton) record the task** — no test file. Confirm the current defect: `grep -n "101319" apps/web/app/globals.css` shows the stray override.
- [ ] **Step 2: (skeleton) confirm existing ClusterView tests are green** — `npx vitest run components/clusters/ClusterView.spec.tsx` PASSES (baseline before the GREEN className swap).
- [ ] **Step 3: Commit the task marker** — this task carries no skeleton diff of its own; its verification is `make smoke-ui` after GREEN. (No commit here; folded into the GREEN commit during execution.)

---

### Task 6: RabbitMqBus reconnect-on-publish (`di8`, partial)

**Files:**
- Modify: `apps/cluster-service/src/cluster_service/messaging/rabbitmq.py` (injectable connection factory; move the class-level `# pragma: no cover` to the live-only methods)
- Test: `apps/cluster-service/tests/test_rabbitmq_reconnect.py` (new; RED)

**Interfaces:**
- Produces: `RabbitMqBus.__init__(self, url: str | None = None, *, connect_attempts: int = 15, connect_delay: float = 2.0, connection_factory: Callable[[], "pika.BlockingConnection"] | None = None)`. When `connection_factory` is given it is used to open (and re-open) the connection; otherwise the default factory calls the existing `_connect(url, …)`.
- Consumes: `pika.exceptions.AMQPConnectionError`, `pika.exceptions.StreamLostError`.

**GREEN obligation (for the implementer):** on `publish`, if `basic_publish`
(or channel access) raises `AMQPConnectionError`/`StreamLostError`, re-open the
connection via the factory, reset `_declared` and re-declare the destination
topology, and retry the publish once; if the retry also fails, raise. The real
`_connect`/`consume`/`start`/`close` stay `# pragma: no cover` (smoke-verified);
`publish`, `_ensure_topology`, and the factory path of `__init__` become covered
by the fake below.

- [ ] **Step 1: Write the RED test** — `tests/test_rabbitmq_reconnect.py`:

```python
from __future__ import annotations

import pika.exceptions

from cluster_service.messaging.port import BusMessage
from cluster_service.messaging.rabbitmq import RabbitMqBus


class FakeChannel:
    def __init__(self) -> None:
        self.published: list[bytes] = []
        self.declared: list[str] = []
        self.fail_next_publish = False

    def exchange_declare(self, **kw) -> None:  # type: ignore[no-untyped-def]
        self.declared.append(kw.get("exchange", ""))

    def queue_declare(self, **kw) -> None:  # type: ignore[no-untyped-def]
        pass

    def queue_bind(self, **kw) -> None:  # type: ignore[no-untyped-def]
        pass

    def basic_publish(self, **kw) -> None:  # type: ignore[no-untyped-def]
        if self.fail_next_publish:
            self.fail_next_publish = False
            raise pika.exceptions.StreamLostError("Stream connection lost")
        self.published.append(kw["body"])


class FakeConnection:
    def __init__(self, channel: FakeChannel) -> None:
        self._channel = channel
        self.is_open = True

    def channel(self) -> FakeChannel:
        return self._channel

    def close(self) -> None:
        self.is_open = False


def test_publish_reconnects_after_idle_drop() -> None:
    # why: an idle broker drops the connection; the next publish must reconnect,
    # re-declare topology, and deliver — not raise a 500 to the gateway (the s014 bug)
    first, second = FakeChannel(), FakeChannel()
    first.fail_next_publish = True
    conns = iter([FakeConnection(first), FakeConnection(second)])
    bus = RabbitMqBus(connection_factory=lambda: next(conns))
    bus.publish("cluster.process", BusMessage(body=b"job", correlation_id="c"))
    assert second.published == [b"job"]           # delivered on the reconnected channel
    assert "cluster.process" in second.declared   # topology re-declared after reconnect


def test_publish_succeeds_without_drop() -> None:
    # why: the happy path is unchanged — one publish, one declare, no reconnect
    ch = FakeChannel()
    bus = RabbitMqBus(connection_factory=lambda: FakeConnection(ch))
    bus.publish("cluster.process", BusMessage(body=b"job", correlation_id="c"))
    assert ch.published == [b"job"]
```

- [ ] **Step 2: Run to confirm RED** — `make test-cluster` (or `cd apps/cluster-service && .venv/bin/pytest tests/test_rabbitmq_reconnect.py -v`). Expected: `test_publish_reconnects_after_idle_drop` FAILS — `StreamLostError` propagates (no reconnect); `test_publish_succeeds_without_drop` FAILS first on `__init__` not accepting `connection_factory` (until the stub lands).

- [ ] **Step 3: Write the stub seam** in `rabbitmq.py` — add the factory param and use it in `__init__`; move the pragma; leave `publish` WITHOUT reconnect (raises through):

```python
class RabbitMqBus:
    def __init__(self, url=None, *, connect_attempts=15, connect_delay=2.0, connection_factory=None):
        self._factory = connection_factory or (lambda: self._connect(url, connect_attempts, connect_delay))
        self._connection = self._factory()
        self._channel = self._connection.channel()
        self._declared: set[str] = set()

    @staticmethod
    def _connect(url, attempts, delay):  # pragma: no cover - live-broker IO
        ...  # unchanged real pika connect
```
Keep `# pragma: no cover` on `_connect`, `consume`, `_on_message`, `start`, `close`. Remove it from the class line, `__init__`, `publish`, `_ensure_topology`.

- [ ] **Step 4: Confirm still RED + lint** — re-run: `test_publish_succeeds_without_drop` now PASSES (factory path works); `test_publish_reconnects_after_idle_drop` still FAILS (publish does not yet reconnect). Run `make lint-cluster`.

- [ ] **Step 5: Commit** — `git add apps/cluster-service/src/cluster_service/messaging/rabbitmq.py apps/cluster-service/tests/test_rabbitmq_reconnect.py && git commit -m "skeleton(di8): RabbitMqBus reconnect seam (RED + factory stub)"`

---

## Self-Review

- **Obligation coverage:** n7w timeout → Task 1 RED; gfs transient/stuck/modal-error/DRY → Task 2 RED (stale-race folded into the generation guard, noted); 56l session-log/loading/logout → Task 3 RED×3; rh0 date/empty-state → Task 4 RED×2 (Combobox = visual, per non-goal); zv7 → visual lane, smoke-ui (no RED, by design); di8 reconnect → Task 6 RED. Every behavior obligation has a failing test.
- **Skeleton-failure scan:** no TBD/TODO-as-spec; every test has a concrete fixture + expected value; stub bodies throw `NotImplementedError`/sentinel or are explicitly "unchanged existing code is the failing stub".
- **Type consistency:** `CLUSTER_POLL_MAX_ATTEMPTS`, `GALLERY_POLL_MAX_ERRORS`/`GALLERY_POLL_MAX_TICKS`, `formatUsageDate`, `FALLBACK`/`fmt`/`fmtBytes`/`fmtDimensions`, `connection_factory` — names identical between test and stub.
- **Reviewable size:** ~11 focused RED tests + small stubs + the di8 factory seam + globals.css defect note. No GREEN implementation present.
- **e2e/smoke:** UI items → `make smoke-ui` (live); di8 → `make smoke-cluster` (live broker), both required green before final review.
