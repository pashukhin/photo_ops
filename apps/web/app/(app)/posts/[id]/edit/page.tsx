import { PostEditor } from '@/components/posts/PostEditor';

// /posts/[id]/edit — the draft post editor (session 018), inside the (app) auth
// boundary. The affordance in ClusterView routes here after CreatePostFromCluster.
export default function PostEditPage({ params }: { params: { id: string } }) {
  return <PostEditor postId={params.id} />;
}
