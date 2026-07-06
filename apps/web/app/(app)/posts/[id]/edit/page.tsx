import { PostEditor } from '@/components/posts/PostEditor';

// /posts/[id]/edit — the draft post editor (session 018), inside the (app) auth
// boundary. The affordance in ClusterView routes here after CreatePostFromCluster.
// Next 15: dynamic route params are async.
export default async function PostEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PostEditor postId={id} />;
}
