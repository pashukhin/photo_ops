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
