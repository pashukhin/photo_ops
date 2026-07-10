import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import { ClusterView, CLUSTER_POLL_MS, CLUSTER_POLL_MAX_ATTEMPTS } from './ClusterView';

vi.mock('../../lib/api', () => ({
  listClusteringMethods: vi.fn(),
  listClusteringResults: vi.fn(),
  getClusteringResult: vi.fn(),
  generateClusters: vi.fn(),
  listPhotos: vi.fn(),
  createPost: vi.fn(),
  deleteClusteringResult: vi.fn()
}));

// PhotoMap is Leaflet glue (no layout in jsdom) — stub it to a marker div so the
// map switcher is assertable in units; the real render is smoke-verified.
vi.mock('../map/PhotoMap', () => ({
  default: ({ points }: { points: unknown[] }) => <div data-testid="photo-map">{points.length}</div>
}));

// Router push for the create-post affordance (session 018). Referenced lazily
// inside the factory (call-time), matching the AppShell.spec usePathname pattern.
const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));

// Minimal PhotoAsset for the id→photo map ClusterView builds to render item
// thumbnails; only id/filename/variants are consumed by the tree.
function photoAsset(id: string): import('../../lib/api').PhotoAsset {
  return {
    id,
    filename: `${id}.jpg`,
    contentType: 'image/jpeg',
    sizeBytes: '10',
    objectKey: `k/${id}`,
    status: 'ready',
    createdAt: 'c',
    updatedAt: 'u',
    variants: [{ variantType: 'thumbnail', url: `http://img/${id}.jpg`, width: 40, height: 40 }]
  } as unknown as import('../../lib/api').PhotoAsset;
}

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
  // Default: the two item photos (p1, p2) resolve to thumbnails.
  vi.mocked(api.listPhotos).mockResolvedValue({ photos: [photoAsset('p1'), photoAsset('p2')], totalCount: 2 });
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
    // items now render as photo thumbnails, not raw ids
    expect(await screen.findByAltText('p1.jpg')).toBeTruthy();
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

  it('renders cluster item photos as thumbnails from the resolved photo map', async () => {
    // why: a cluster's leaf items should show photo thumbnails, not raw ids
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    const img1 = await screen.findByAltText('p1.jpg');
    expect(img1).toHaveAttribute('src', 'http://img/p1.jpg');
    expect(screen.getByAltText('p2.jpg')).toHaveAttribute('src', 'http://img/p2.jpg');
  });

  it('falls back to the item id when its photo is not resolved', async () => {
    // why: an item whose photo is missing/unready must not vanish — show its id
    vi.mocked(api.listPhotos).mockResolvedValue({ photos: [], totalCount: 0 });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('Canon EOS R5');
    expect(screen.getByText('p1')).toBeTruthy();
    expect(screen.getByText('p2')).toBeTruthy();
  });

  it('shows "Create post" on a selectable node and routes to the editor on click', async () => {
    // why: the bridge — a real (non-root, non-empty) cluster node becomes a draft.
    push.mockClear();
    vi.mocked(api.createPost).mockResolvedValue({ id: 'post-9', photos: [] } as never);
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    const btn = await screen.findByRole('button', { name: /create post/i });
    fireEvent.click(btn);
    await waitFor(() => expect(api.createPost).toHaveBeenCalledWith({ resultId: 'r1', nodeId: 'seg' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/posts/post-9/edit'));
  });

  it('surfaces a create-post failure in the error banner', async () => {
    // why: a failed create must not be lost — it shows in the shared error state.
    vi.mocked(api.createPost).mockRejectedValue(new Error('create boom'));
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    fireEvent.click(await screen.findByRole('button', { name: /create post/i }));
    await screen.findByText(/create boom/);
  });

  it('does not show "Create post" on the root node', async () => {
    // why: 4o2 #3 — root would snapshot the whole tree incl. not_clusterable.
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('Canon EOS R5'); // tree rendered
    // the only Create-post button belongs to the selectable 'seg' child, not root
    expect(screen.queryAllByRole('button', { name: /create post/i })).toHaveLength(1);
  });

  it('does not show "Create post" on a not_clusterable or empty node', async () => {
    // why: 4o2 #3 — the excluded-photos bucket and a photo-less node are not posts.
    vi.mocked(api.getClusteringResult).mockResolvedValue({
      ...TREE,
      root: {
        ...TREE.root,
        children: [
          { ...TREE.root.children[0], id: 'nc', kind: 'not_clusterable', segmentLabel: '', items: [] },
          { ...TREE.root.children[0], id: 'mt', kind: 'leaf', segmentLabel: 'Empty leaf', photoCount: 0, items: [] }
        ]
      }
    });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('Empty leaf');
    expect(screen.queryAllByRole('button', { name: /create post/i })).toHaveLength(0);
  });

  it('stops polling and surfaces a timeout when a run never leaves pending', async () => {
    // why: a stuck-PENDING run (worker down / DLQ) must fail with an error, not spin forever
    vi.useFakeTimers();
    vi.mocked(api.getClusteringResult).mockResolvedValue({ ...TREE, status: 'pending', root: null });
    render(<ClusterView />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    }); // methods + results load
    vi.mocked(api.getClusteringResult).mockClear(); // this file's beforeEach doesn't clear; ignore leaked calls
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

  it('switches the active result between tree, map and histogram', async () => {
    // why: the workspace is one result viewed three ways (switcher over the whole result)
    // p1/p2 carry DISTINCT valid taken times so binByTime yields >=1 histogram bar at GREEN
    // (a shared time or no time -> zero span -> []; the default photoAsset has neither).
    vi.mocked(api.listPhotos).mockResolvedValue({
      photos: [
        { ...photoAsset('p1'), takenAtUtc: '2024-06-15T00:00:00Z' },
        { ...photoAsset('p2'), takenAtUtc: '2024-06-17T00:00:00Z' }
      ],
      totalCount: 2
    });
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row'));
    await screen.findByText('Canon EOS R5'); // tree shows by default
    fireEvent.click(screen.getByRole('button', { name: /^map$/i }));
    expect(await screen.findByTestId('photo-map')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /histogram/i }));
    expect(await screen.findAllByTestId('histogram-bar')).not.toHaveLength(0);
  });

  it('deletes a run after confirm and drops it from the list', async () => {
    // why: delete is confirmed (no one-click loss) and the row disappears on success
    vi.mocked(api.deleteClusteringResult).mockResolvedValue(undefined);
    vi.mocked(api.listClusteringResults).mockResolvedValueOnce(RESULTS).mockResolvedValue({ results: [] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ClusterView />);
    await screen.findByTestId('result-row');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(api.deleteClusteringResult).toHaveBeenCalledWith('r1'));
    await waitFor(() => expect(screen.queryByTestId('result-row')).not.toBeInTheDocument());
  });

  it('surfaces a delete failure in the error banner', async () => {
    // why: a failed delete must not be lost — it shows in the shared error state
    vi.mocked(api.deleteClusteringResult).mockRejectedValue(new Error('del boom'));
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ClusterView />);
    await screen.findByTestId('result-row');
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await screen.findByText(/del boom/);
  });

  it('clears the open result when its run is deleted', async () => {
    // why: deleting the run currently viewed must close its body (not leave a stale tree)
    vi.mocked(api.deleteClusteringResult).mockResolvedValue(undefined);
    vi.mocked(api.listClusteringResults).mockResolvedValueOnce(RESULTS).mockResolvedValue({ results: [] });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ClusterView />);
    fireEvent.click(await screen.findByTestId('result-row')); // open r1
    await screen.findByText('Canon EOS R5'); // its tree/switcher body shows
    fireEvent.click(screen.getByRole('button', { name: /delete/i }));
    await waitFor(() => expect(screen.queryByText('Canon EOS R5')).not.toBeInTheDocument());
  });
});
