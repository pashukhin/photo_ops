import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PhotosRoute from './page';

vi.mock('@/components/photos/PhotosPage', () => ({ PhotosPage: () => <div>photos-page</div> }));

describe('/photos route', () => {
  it('renders PhotosPage', () => {
    render(<PhotosRoute />);
    expect(screen.getByText('photos-page')).toBeTruthy();
  });
});
