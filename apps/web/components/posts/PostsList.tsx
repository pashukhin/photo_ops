'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { listPosts } from '../../lib/api';
import type { PostSummary } from '../../lib/api';

function dateRange(post: PostSummary): string {
  const d = (iso: string) => (iso ? iso.slice(0, 10) : '');
  const a = d(post.dateFrom);
  const b = d(post.dateTo);
  if (a && b && a !== b) return `${a} – ${b}`;
  return a || b || '';
}

// Owner "My posts" listing (session 020) — fetches listPosts() on mount and links
// each post back to its editor (the summary has no slug). The share/public link
// lives in the editor's published panel.
export function PostsList() {
  const [posts, setPosts] = useState<PostSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listPosts()
      .then(({ posts }) => setPosts(posts))
      .catch((e: unknown) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load your posts: {error}
      </p>
    );
  }

  if (posts === null) {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        Loading your posts…
      </p>
    );
  }

  if (posts.length === 0) {
    return <p className="text-sm text-muted-foreground">No posts yet. Create one from a cluster.</p>;
  }

  return (
    <ul className="space-y-2">
      {posts.map((post) => {
        const range = dateRange(post);
        return (
          <li key={post.id} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2">
            <div className="min-w-0">
              <Link href={`/posts/${post.id}/edit`} className="font-medium underline">
                {post.title || 'Untitled story'}
              </Link>
              <p className="text-sm text-muted-foreground">
                <span className="capitalize">{post.status}</span>
                {post.visibility ? <span className="capitalize"> · {post.visibility}</span> : null}
                {range ? <span> · {range}</span> : null}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
