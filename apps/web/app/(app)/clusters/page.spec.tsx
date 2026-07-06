import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ClustersPage from './page';

vi.mock('@/lib/api', () => ({
  listClusteringMethods: vi.fn().mockResolvedValue({ methods: [] }),
  listClusteringResults: vi.fn().mockResolvedValue({ results: [] }),
  getClusteringResult: vi.fn(),
  generateClusters: vi.fn(),
  createPost: vi.fn(),
  listPhotos: vi.fn().mockResolvedValue({ photos: [], totalCount: 0 })
}));

// ClusterView uses useRouter for the create-post affordance (session 018).
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

describe('ClustersPage', () => {
  it('renders the ClusterView', async () => {
    render(<ClustersPage />);
    expect(await screen.findByText('Generate clusters')).toBeTruthy();
  });
});
