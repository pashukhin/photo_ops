import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { UsageReport, formatUsageDate } from './UsageReport';

vi.mock('../../lib/api', () => ({
  getUsageSummary: vi.fn(),
  listUsageEvents: vi.fn()
}));

const SUMMARY = {
  lines: [{ eventType: 'photo_processed', resourceType: 'processing', totalQuantity: 1, unit: 'operation' }],
  estimatedMonthlyCost: '0.12',
  currency: 'USD'
};

const EVENTS = {
  lines: [
    {
      occurredAt: '2026-06-30T12:00:00Z',
      eventType: 'photo_processed',
      resourceType: 'processing',
      quantity: 1,
      unit: 'operation',
      unitPrice: '0.00005',
      amount: '0.05',
      currency: 'USD',
      sourceEntityType: 'processing_job',
      sourceEntityId: 'job-1'
    }
  ],
  totalCount: 1,
  filteredTotalAmount: '0.05',
  currency: 'USD'
};

beforeEach(() => {
  vi.mocked(api.getUsageSummary).mockResolvedValue(SUMMARY);
  vi.mocked(api.listUsageEvents).mockResolvedValue(EVENTS);
});

describe('UsageReport', () => {
  it('loads and renders usage line items with their cost', async () => {
    // why: the report's purpose is to show spent units + cost per operation.
    render(<UsageReport />);

    expect(api.listUsageEvents).toHaveBeenCalled();
    // the line's operation type renders…
    await screen.findByText('photo_processed');
    // …and its cost (the line amount / filtered total) is shown.
    expect(screen.getAllByText(/0\.05/).length).toBeGreaterThan(0);
  });

  it('renders occurred_at as a localized date, not raw RFC3339', () => {
    // why: raw '2026-06-15T09:30:00Z' is unreadable; show a localized date
    expect(formatUsageDate('2026-06-15T09:30:00Z')).toBe('Jun 15, 2026');
  });

  it('shows a filter-aware empty state when a filter yields no rows', async () => {
    // why: a free-form type that matches nothing must explain itself, not look empty-by-default
    vi.mocked(api.listUsageEvents).mockResolvedValue({
      lines: [],
      totalCount: 0,
      filteredTotalAmount: '0.00',
      currency: 'USD'
    });
    render(<UsageReport />);
    fireEvent.change(await screen.findByLabelText(/resource type/i), { target: { value: 'nope' } });
    expect(await screen.findByText(/filter/i)).toBeTruthy();
  });

  it('refetches with the new filter when the resource-type filter changes', async () => {
    // why: filtering by resource type is server-side; changing it must refetch
    // listUsageEvents with the new resourceType.
    render(<UsageReport />);
    await waitFor(() => expect(api.listUsageEvents).toHaveBeenCalled());
    vi.mocked(api.listUsageEvents).mockClear();

    fireEvent.change(screen.getByLabelText(/resource type/i), { target: { value: 'storage' } });

    await waitFor(() => {
      expect(api.listUsageEvents).toHaveBeenCalledWith(expect.objectContaining({ resourceType: 'storage' }));
    });
  });
});
