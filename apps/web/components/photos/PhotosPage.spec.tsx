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
