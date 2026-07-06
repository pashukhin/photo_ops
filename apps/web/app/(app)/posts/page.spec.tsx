import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PostsPage from './page';

vi.mock('@/components/posts/PostsList', () => ({ PostsList: () => <div>posts-list</div> }));

describe('PostsPage', () => {
  it('renders the owner posts listing', () => {
    // why: /posts is the owner listing route inside the (app) auth boundary.
    render(<PostsPage />);
    expect(screen.getByText('posts-list')).toBeTruthy();
  });
});
