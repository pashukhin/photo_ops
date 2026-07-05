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
  // Reset call history between tests (sibling-spec convention) so per-test
  // "not called" / call-count assertions don't see calls from earlier tests.
  vi.clearAllMocks();
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

  it('shows a message and uploads nothing when no file is chosen', async () => {
    // why: the no-file guard must not fire a bogus upload
    render(<PhotosPage />);
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(await screen.findByText(/choose a jpeg/i)).toBeTruthy();
    expect(api.createUploadIntent).not.toHaveBeenCalled();
  });

  it('surfaces an upload error', async () => {
    // why: a failed upload must tell the user, not fail silently
    vi.mocked(api.createUploadIntent).mockRejectedValue(new Error('intent boom'));
    render(<PhotosPage />);
    const file = new File(['x'], 'p.jpg', { type: 'image/jpeg' });
    fireEvent.change(screen.getByLabelText(/upload/i), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: /upload/i }));
    expect(await screen.findByText(/intent boom/i)).toBeTruthy();
  });
});
