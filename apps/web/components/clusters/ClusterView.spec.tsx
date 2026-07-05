import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { ClusterView, CLUSTER_POLL_MS, CLUSTER_POLL_MAX_ATTEMPTS } from './ClusterView';

vi.mock('../../lib/api', () => ({
  listClusteringMethods: vi.fn(),
  listClusteringResults: vi.fn(),
  getClusteringResult: vi.fn(),
  generateClusters: vi.fn()
}));

const METHODS = {
  methods: [
    {
      id: 'time_only',
      displayName: 'Time (device-segmented)',
      description: '',
      requiredPhotoFields: ['taken_at'],
      defaultParamsJson: '{}'
    }
  ]
};

const RESULTS = {
  results: [
    {
      id: 'r1',
      method: 'time_only',
      status: 'ready',
      photoCount: 3,
      dateFrom: '2024-06-15',
      dateTo: '2024-06-17',
      createdAt: 'c'
    }
  ]
};

const TREE = {
  id: 'r1',
  userId: 'u1',
  method: 'time_only',
  paramsJson: '{}',
  inputFingerprint: 'fp',
  status: 'ready',
  errorMessage: '',
  createdAt: 'c',
  root: {
    id: 'root',
    kind: 'root',
    mergeDistance: 0,
    dateFrom: '2024-06-15',
    dateTo: '2024-06-17',
    photoCount: 3,
    coverPhotoId: 'p1',
    segmentLabel: '',
    items: [],
    children: [
      {
        id: 'seg',
        kind: 'segment',
        mergeDistance: 0,
        dateFrom: '2024-06-15',
        dateTo: '2024-06-15',
        photoCount: 2,
        coverPhotoId: 'p1',
        segmentLabel: 'Canon EOS R5',
        items: ['p1', 'p2'],
        children: []
      }
    ]
  }
};

beforeEach(() => {
  vi.mocked(api.listClusteringMethods).mockResolvedValue(METHODS);
  vi.mocked(api.listClusteringResults).mockResolvedValue(RESULTS);
  vi.mocked(api.getClusteringResult).mockResolvedValue(TREE);
  vi.mocked(api.generateClusters).mockResolvedValue({ resultId: 'r1', status: 'pending' });
});

describe('ClusterView', () => {
  it('lists the user results and the method picker', async () => {
    render(<ClusterView />);
    const row = await screen.findByTestId('result-row');
    expect(row.textContent).toContain('time_only');
    expect(row.textContent).toContain('3 photos');
    expect(await screen.findByRole('option', { name: 'Time (device-segmented)' })).toBeTruthy();
  });

  it('opens a result and renders its tree as a nested list', async () => {
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    expect(api.getClusteringResult).toHaveBeenCalledWith('r1');
    await screen.findByText('Canon EOS R5');
    expect(screen.getByText(/p1, p2/)).toBeTruthy();
  });

  it('generate runs the selected method and shows the ready tree', async () => {
    render(<ClusterView />);
    fireEvent.click(await screen.findByText('Generate clusters'));
    await waitFor(() =>
      expect(api.generateClusters).toHaveBeenCalledWith({ method: 'time_only' })
    );
    await screen.findByText('Canon EOS R5');
  });

  it('shows an empty state when there are no results', async () => {
    vi.mocked(api.listClusteringResults).mockResolvedValue({ results: [] });
    render(<ClusterView />);
    await screen.findByText('No clustering results yet.');
  });

  it('surfaces a generate error', async () => {
    vi.mocked(api.generateClusters).mockRejectedValue(new Error('boom'));
    render(<ClusterView />);
    fireEvent.click(await screen.findByText('Generate clusters'));
    await screen.findByText(/boom/);
  });

  it('renders a failed result with its error message', async () => {
    vi.mocked(api.getClusteringResult).mockResolvedValue({
      ...TREE,
      status: 'failed',
      errorMessage: 'kaput',
      root: null
    });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('kaput');
  });

  it('renders a node without a date span', async () => {
    vi.mocked(api.getClusteringResult).mockResolvedValue({
      ...TREE,
      root: { ...TREE.root, dateFrom: '', dateTo: '', children: [], items: ['solo'] }
    });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText(/solo/); // dateless node renders (no-date-span branch)
  });

  it('shows "not ready" when a result has no root yet', async () => {
    vi.mocked(api.getClusteringResult).mockResolvedValue({ ...TREE, root: null });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('Not ready.');
  });

  it('polls a pending result until it is ready', async () => {
    // first poll returns pending; after CLUSTER_POLL_MS the second returns ready
    vi.mocked(api.getClusteringResult)
      .mockResolvedValueOnce({ ...TREE, status: 'pending', root: null })
      .mockResolvedValue(TREE);
    render(<ClusterView />);
    fireEvent.click(await screen.findByText('Generate clusters'));
    await screen.findByText('Canon EOS R5', undefined, { timeout: 5000 });
    expect(vi.mocked(api.getClusteringResult).mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it('stops polling and surfaces a timeout when a run never leaves pending', async () => {
    // why: a stuck-PENDING run (worker down / DLQ) must fail with an error, not spin forever
    vi.useFakeTimers();
    vi.mocked(api.getClusteringResult).mockResolvedValue({ ...TREE, status: 'pending', root: null });
    render(<ClusterView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    }); // methods + results load
    fireEvent.click(screen.getByText('Generate clusters'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(CLUSTER_POLL_MS * (CLUSTER_POLL_MAX_ATTEMPTS + 2));
    });
    expect(screen.getByText(/timed out/i)).toBeTruthy();
    // bounded: the poll did not run away
    expect(vi.mocked(api.getClusteringResult).mock.calls.length).toBeLessThanOrEqual(
      CLUSTER_POLL_MAX_ATTEMPTS + 2
    );
    vi.useRealTimers();
  });
});
