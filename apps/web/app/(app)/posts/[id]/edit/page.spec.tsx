import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostEditPage from './page';

vi.mock('@/components/posts/PostEditor', () => ({
  PostEditor: ({ postId }: { postId: string }) => <div>editor:{postId}</div>
}));

describe('PostEditPage', () => {
  it('renders the editor for the route post id', async () => {
    // why: the dynamic [id] segment (async in Next 15) must reach the editor.
    render(await PostEditPage({ params: Promise.resolve({ id: 'post-1' }) }));
    expect(screen.getByText('editor:post-1')).toBeTruthy();
  });
});
