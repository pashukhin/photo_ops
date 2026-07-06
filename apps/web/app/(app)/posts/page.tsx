import { PostsList } from '@/components/posts/PostsList';

// /posts — the owner's "My posts" listing, inside the (app) auth boundary
// (AuthGuard + AppShell). Reachable from the Posts nav entry (session 020).
export default function PostsPage() {
  return <PostsList />;
}
