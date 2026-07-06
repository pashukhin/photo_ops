'use client';

// PostEditor (session 018) — the draft post editor. GREEN is the implementer's
// job: on mount load getPost(postId) + listPhotos (for the variant thumbnail
// map like ClusterView), render title/body inputs and a per-photo row (thumbnail
// + caption input + ↑/↓ reorder + remove), and a Save button that calls
// updatePost(postId, { title, body, photos: <current order> }). A getPost
// failure (404 / not owned) renders an error message.
export function PostEditor({ postId }: { postId: string }) {
  return <p>Loading post {postId}…</p>;
}
