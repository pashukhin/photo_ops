import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import RootPage from './page';

const redirect = vi.fn();
vi.mock('next/navigation', () => ({ redirect: (u: string) => redirect(u) }));

describe('RootPage', () => {
  it('redirects to /photos', () => {
    // why: / is not a page anymore — Photos is the app's home section
    render(<RootPage />);
    expect(redirect).toHaveBeenCalledWith('/photos');
  });
});
