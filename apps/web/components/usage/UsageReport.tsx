'use client';

// UsageReport — the itemized usage report (session 012 add-on). Owns the filter
// state (date range, resource_type, event_type, pagination), fetches the summary
// (header) + the filtered events page, and renders the filter bar + line-items
// table (date · operation type · resource type · quantity+unit · cost) + the
// filtered total + pagination. Filter/pagination are server-side, mirroring the
// 011 gallery (components/gallery).
//
// GREEN obligation (pinned by UsageReport.spec.tsx): on mount, fetch
// getUsageSummary + listUsageEvents; render each event line (incl. its amount)
// and the filtered total; a labelled "Resource type" filter whose change
// refetches listUsageEvents with the updated `resourceType`. Reuse the
// components/ui primitives + the 011 table/toolbar/pagination patterns.
export function UsageReport() {
  // Stub renders a placeholder so the RED spec (real line items + a working
  // filter) fails until the implementer fills it.
  return <div data-testid="usage-report-placeholder">Usage report — not implemented</div>;
}
