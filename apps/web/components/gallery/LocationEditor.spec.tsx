import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as api from '../../lib/api';
import LocationEditor from './LocationEditor';

vi.mock('../../lib/api', () => ({
  setPhotoLocation: vi.fn()
}));

// PhotoMap is Leaflet glue — stub it to a "pick here" button that fires onPick, so
// the editor's coordinate capture is assertable in units (the real map is smoke-verified).
vi.mock('../map/PhotoMap', () => ({
  default: ({ onPick }: { onPick?: (lat: number, lon: number) => void }) => (
    <button type="button" onClick={() => onPick?.(48.85, 2.35)}>
      pick here
    </button>
  )
}));

describe('LocationEditor', () => {
  it('saves the typed place plus the picked point', async () => {
    // why: manual location = labels + an optional map-clicked point, sent to setPhotoLocation
    vi.mocked(api.setPhotoLocation).mockResolvedValue({ id: 'photo-1' } as never);
    const onSaved = vi.fn();
    render(<LocationEditor photoId="photo-1" onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Paris' } });
    fireEvent.click(screen.getByRole('button', { name: /pick here/i })); // stub PhotoMap -> onPick(48.85,2.35)
    fireEvent.click(screen.getByRole('button', { name: /save location/i }));
    await waitFor(() =>
      expect(api.setPhotoLocation).toHaveBeenCalledWith(
        'photo-1',
        expect.objectContaining({ place: expect.objectContaining({ city: 'Paris' }), lat: 48.85, lon: 2.35 })
      )
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it('saves a label with no picked point (label-only)', async () => {
    // why: spec decision 6 — the point is optional; a label-only save is allowed
    // (it applies the tag but leaves the photo off the map). No "pick here" click here.
    vi.mocked(api.setPhotoLocation).mockResolvedValue({ id: 'photo-1' } as never);
    render(<LocationEditor photoId="photo-1" onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText(/city/i), { target: { value: 'Paris' } });
    fireEvent.click(screen.getByRole('button', { name: /save location/i }));
    await waitFor(() =>
      expect(api.setPhotoLocation).toHaveBeenCalledWith(
        'photo-1',
        expect.objectContaining({ place: expect.objectContaining({ city: 'Paris' }) })
      )
    );
    const [, arg] = vi.mocked(api.setPhotoLocation).mock.calls[0];
    expect(arg.lat).toBeUndefined();
    expect(arg.lon).toBeUndefined();
  });
});
