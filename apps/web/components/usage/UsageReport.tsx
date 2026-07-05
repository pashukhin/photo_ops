'use client';

import { useEffect, useState } from 'react';
import { getUsageSummary, listUsageEvents } from '../../lib/api';
import type { ListUsageEventsParams, UsageEventLine, UsageSummary } from '../../lib/api';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { GalleryPagination } from '../gallery/GalleryPagination';

// UsageReport — the itemized usage report (session 012 add-on). Owns the filter
// state (date range, resource_type, event_type, pagination), fetches the summary
// (header) + the filtered events page, and renders the filter bar + line-items
// table (date · operation type · resource type · quantity+unit · cost) + the
// filtered total + pagination. Filter/pagination are server-side, mirroring the
// 011 gallery (components/gallery).

const PAGE_SIZE = 25;

interface FilterState {
  from: string;
  to: string;
  resourceType: string;
  eventType: string;
}

const EMPTY_FILTER: FilterState = { from: '', to: '', resourceType: '', eventType: '' };

// GREEN (photo_ops-rh0): render occurred_at as a localized medium date (UTC),
// not raw RFC3339 — e.g. '2026-06-15T09:30:00Z' → 'Jun 15, 2026'.
export function formatUsageDate(iso: string): string {
  void iso;
  throw new Error('NotImplementedError');
}

function buildParams(filter: FilterState, page: number): ListUsageEventsParams {
  const params: ListUsageEventsParams = { page, pageSize: PAGE_SIZE };
  if (filter.from) params.from = filter.from;
  if (filter.to) params.to = filter.to;
  if (filter.resourceType) params.resourceType = filter.resourceType;
  if (filter.eventType) params.eventType = filter.eventType;
  return params;
}

// --- Sub-components ---

interface UsageSummaryHeaderProps {
  summary: UsageSummary;
}

function UsageSummaryHeader({ summary }: UsageSummaryHeaderProps) {
  return (
    <div className="p-4 border rounded-md space-y-2">
      <h2 className="text-lg font-semibold">Usage Summary</h2>
      <div className="space-y-1">
        {summary.lines.map((line, i) => (
          <div key={i} className="text-sm">
            {line.resourceType} / {line.eventType}: {line.totalQuantity} {line.unit}
          </div>
        ))}
      </div>
      <p className="text-sm font-medium">
        Estimated monthly cost: {summary.estimatedMonthlyCost} {summary.currency}
      </p>
    </div>
  );
}

interface UsageFilterBarProps {
  filter: FilterState;
  resourceTypeOptions: string[];
  eventTypeOptions: string[];
  onChange: (next: FilterState) => void;
}

function UsageFilterBar({ filter, resourceTypeOptions, eventTypeOptions, onChange }: UsageFilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-4">
      <div className="flex items-center gap-2">
        <label htmlFor="usage-from" className="text-sm font-medium whitespace-nowrap">
          From
        </label>
        <input
          id="usage-from"
          type="date"
          value={filter.from}
          onChange={(e) => onChange({ ...filter, from: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="usage-to" className="text-sm font-medium whitespace-nowrap">
          To
        </label>
        <input
          id="usage-to"
          type="date"
          value={filter.to}
          onChange={(e) => onChange({ ...filter, to: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="usage-resource-type" className="text-sm font-medium whitespace-nowrap">
          Resource type
        </label>
        <input
          id="usage-resource-type"
          type="text"
          list="usage-resource-type-options"
          value={filter.resourceType}
          placeholder="All"
          onChange={(e) => onChange({ ...filter, resourceType: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <datalist id="usage-resource-type-options">
          {resourceTypeOptions.map((rt) => (
            <option key={rt} value={rt} />
          ))}
        </datalist>
      </div>

      <div className="flex items-center gap-2">
        <label htmlFor="usage-event-type" className="text-sm font-medium whitespace-nowrap">
          Operation type
        </label>
        <input
          id="usage-event-type"
          type="text"
          list="usage-event-type-options"
          value={filter.eventType}
          placeholder="All"
          onChange={(e) => onChange({ ...filter, eventType: e.target.value })}
          className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <datalist id="usage-event-type-options">
          {eventTypeOptions.map((et) => (
            <option key={et} value={et} />
          ))}
        </datalist>
      </div>
    </div>
  );
}

interface UsageTableProps {
  lines: UsageEventLine[];
  filteredTotalAmount: string;
  currency: string;
}

function UsageTable({ lines, filteredTotalAmount, currency }: UsageTableProps) {
  return (
    <div className="space-y-2">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Operation type</TableHead>
            <TableHead>Resource type</TableHead>
            <TableHead>Quantity</TableHead>
            <TableHead>Cost</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line, i) => (
            <TableRow key={i}>
              <TableCell>{line.occurredAt}</TableCell>
              <TableCell>{line.eventType}</TableCell>
              <TableCell>{line.resourceType}</TableCell>
              <TableCell>
                {line.quantity} {line.unit}
              </TableCell>
              <TableCell>
                {line.amount} {line.currency}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-sm font-medium px-4">
        Filtered total: {filteredTotalAmount} {currency}
      </p>
    </div>
  );
}

// --- Main container ---

export function UsageReport() {
  const [filter, setFilter] = useState<FilterState>(EMPTY_FILTER);
  const [page, setPage] = useState(1);

  const [summary, setSummary] = useState<UsageSummary | null>(null);
  const [lines, setLines] = useState<UsageEventLine[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [filteredTotalAmount, setFilteredTotalAmount] = useState('0.00');
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch summary once on mount.
  useEffect(() => {
    void getUsageSummary()
      .then((s) => setSummary(s))
      .catch((err: unknown) => {
        // Non-fatal: summary header just stays absent on error.
        console.error('Failed to load usage summary:', err instanceof Error ? err.message : String(err));
      });
  }, []);

  // Fetch events whenever filter or page changes.
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void listUsageEvents(buildParams(filter, page))
      .then((result) => {
        if (cancelled) return;
        setLines(result.lines);
        setTotalCount(result.totalCount);
        setFilteredTotalAmount(result.filteredTotalAmount);
        setCurrency(result.currency);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, page]);

  // Extract distinct resource/event type options from summary lines.
  const resourceTypeOptions = summary
    ? [...new Set(summary.lines.map((l) => l.resourceType))].filter(Boolean)
    : [];
  const eventTypeOptions = summary
    ? [...new Set(summary.lines.map((l) => l.eventType))].filter(Boolean)
    : [];

  function handleFilterChange(next: FilterState) {
    setFilter(next);
    setPage(1);
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">Usage Report</h1>

      {summary && <UsageSummaryHeader summary={summary} />}

      <UsageFilterBar
        filter={filter}
        resourceTypeOptions={resourceTypeOptions}
        eventTypeOptions={eventTypeOptions}
        onChange={handleFilterChange}
      />

      {loading ? (
        <p>Loading usage events…</p>
      ) : error ? (
        <div role="alert" className="p-4 text-destructive border border-destructive rounded-md">
          {error}
        </div>
      ) : lines.length === 0 ? (
        <p className="text-center text-muted-foreground py-8">No usage events found.</p>
      ) : (
        <>
          <UsageTable lines={lines} filteredTotalAmount={filteredTotalAmount} currency={currency} />
          <GalleryPagination page={page} pageSize={PAGE_SIZE} totalCount={totalCount} onPageChange={setPage} />
        </>
      )}
    </div>
  );
}
