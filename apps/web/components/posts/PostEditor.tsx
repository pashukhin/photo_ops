'use client';

import { useCallback, useEffect, useState } from 'react';
import { getPost, listPhotos, publishPost, unpublishPost, updatePost } from '../../lib/api';
import type { PhotoAsset, Post } from '../../lib/api';
import { canonicalPostUrl, shareText } from '../../lib/share';

// One editable photo row: photo_id is fixed (a member of the post's snapshot),
// caption + list position are what the editor mutates. Order is the array
// position at Save time — canonicalized server-side (no explicit order field).
interface EditablePhoto {
  photoId: string;
  caption: string;
}

// PostEditor (session 018) — edit a draft post's title/body, per-photo caption
// and order (↑/↓), and remove photos, then Save (replace-all UpdatePost). Photos
// render as preview VARIANT thumbnails resolved client-side (like ClusterView),
// never originals (§4.4).
export function PostEditor({ postId }: { postId: string }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [photos, setPhotos] = useState<EditablePhoto[]>([]);
  const [photosById, setPhotosById] = useState<Map<string, PhotoAsset>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Publish state (session 019).
  const [status, setStatus] = useState('');
  const [slug, setSlug] = useState('');
  const [visibility, setVisibility] = useState<'public' | 'unlisted'>('public');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  // Share (session 020): one shared "Copied" confirmation reused by both buttons.
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPost(postId)
      .then((post) => {
        setTitle(post.title);
        setBody(post.body);
        setPhotos(post.photos.map((p) => ({ photoId: p.photoId, caption: p.caption })));
        setStatus(post.status);
        setSlug(post.slug);
        if (post.visibility === 'public' || post.visibility === 'unlisted') {
          setVisibility(post.visibility);
        }
      })
      .catch((e: unknown) => setLoadError(String(e)));
    // Resolve photo_id → thumbnail like ClusterView; non-fatal on failure.
    listPhotos({ page: 1, pageSize: 500, status: ['ready'] })
      .then(({ photos }) => setPhotosById(new Map(photos.map((p) => [p.id, p]))))
      .catch(() => {});
  }, [postId]);

  const setCaption = useCallback((index: number, caption: string) => {
    setPhotos((current) => current.map((p, i) => (i === index ? { ...p, caption } : p)));
  }, []);

  const move = useCallback((index: number, delta: number) => {
    setPhotos((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }, []);

  const remove = useCallback((index: number) => {
    setPhotos((current) => current.filter((_, i) => i !== index));
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await updatePost(postId, {
        title,
        body,
        photos: photos.map((p) => ({ photoId: p.photoId, caption: p.caption }))
      });
      setTitle(updated.title);
      setBody(updated.body);
      setPhotos(updated.photos.map((p) => ({ photoId: p.photoId, caption: p.caption })));
    } catch (e: unknown) {
      setSaveError(String(e));
    } finally {
      setSaving(false);
    }
  }, [postId, title, body, photos]);

  // Publish/unpublish share the same envelope (x36 #2): toggle publishing, clear
  // the error, apply the returned status/slug, surface a failure.
  const runPublishAction = useCallback(async (action: () => Promise<Post>) => {
    setPublishing(true);
    setPublishError(null);
    try {
      const updated = await action();
      setStatus(updated.status);
      setSlug(updated.slug);
    } catch (e: unknown) {
      setPublishError(String(e));
    } finally {
      setPublishing(false);
    }
  }, []);

  const publish = useCallback(
    () => runPublishAction(() => publishPost(postId, visibility)),
    [runPublishAction, postId, visibility]
  );

  const unpublish = useCallback(() => runPublishAction(() => unpublishPost(postId)), [runPublishAction, postId]);

  // Copy text to the clipboard and flash a shared, self-reverting confirmation.
  const copy = useCallback(async (text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  if (loadError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Could not load the post: {loadError}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-sm font-medium">Title</span>
        <input
          aria-label="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 w-full border rounded-md px-2 py-1"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium">Body</span>
        <textarea
          aria-label="Body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={6}
          className="mt-1 w-full border rounded-md px-2 py-1"
        />
      </label>

      <ol className="space-y-2">
        {photos.map((photo, index) => {
          const asset = photosById.get(photo.photoId);
          const thumb = asset?.variants?.find((v) => v.variantType === 'thumbnail');
          return (
            <li key={photo.photoId} className="flex items-center gap-2">
              {thumb ? (
                <img
                  src={thumb.url}
                  alt={asset?.filename ?? photo.photoId}
                  className="h-12 w-12 rounded object-cover"
                />
              ) : (
                <span className="text-xs text-muted-foreground">{photo.photoId}</span>
              )}
              <input
                aria-label={`Caption for ${asset?.filename ?? photo.photoId}`}
                value={photo.caption}
                onChange={(e) => setCaption(index, e.target.value)}
                className="flex-1 border rounded-md px-2 py-1"
              />
              <button
                type="button"
                aria-label="Move up"
                onClick={() => move(index, -1)}
                className="border rounded-md px-2 py-1 text-xs"
              >
                ↑
              </button>
              <button
                type="button"
                aria-label="Move down"
                onClick={() => move(index, 1)}
                className="border rounded-md px-2 py-1 text-xs"
              >
                ↓
              </button>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => remove(index)}
                disabled={photos.length <= 1}
                className="border rounded-md px-2 py-1 text-xs disabled:opacity-40"
              >
                ✕
              </button>
            </li>
          );
        })}
      </ol>

      {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}

      <button
        type="button"
        onClick={() => void save()}
        disabled={saving || photos.length === 0}
        className="border rounded-md px-3 py-1 disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Save'}
      </button>

      <div className="space-y-2 border-t pt-4">
        {status === 'published' ? (
          <>
            <p className="text-sm text-muted-foreground">Published</p>
            <a href={canonicalPostUrl(slug)} className="block text-sm underline break-all">
              {canonicalPostUrl(slug)}
            </a>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void copy(canonicalPostUrl(slug))}
                className="border rounded-md px-3 py-1 text-sm"
              >
                Copy link
              </button>
              <button
                type="button"
                onClick={() => void copy(shareText({ title, body, slug }))}
                className="border rounded-md px-3 py-1 text-sm"
              >
                Copy share text
              </button>
              <span role="status" aria-live="polite" className="text-sm text-muted-foreground">
                {copied ? 'Copied' : ''}
              </span>
            </div>
            <button
              type="button"
              onClick={() => void unpublish()}
              disabled={publishing}
              className="border rounded-md px-3 py-1 disabled:opacity-40"
            >
              {publishing ? 'Working…' : 'Unpublish'}
            </button>
          </>
        ) : (
          <>
            <label className="block">
              <span className="text-sm font-medium">Visibility</span>
              <select
                aria-label="Visibility"
                value={visibility}
                onChange={(e) => setVisibility(e.target.value as 'public' | 'unlisted')}
                className="mt-1 block border rounded-md px-2 py-1"
              >
                <option value="public">Public</option>
                <option value="unlisted">Unlisted</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => void publish()}
              disabled={publishing}
              className="border rounded-md px-3 py-1 disabled:opacity-40"
            >
              {publishing ? 'Working…' : 'Publish'}
            </button>
          </>
        )}
        {publishError ? <p className="text-sm text-destructive">{publishError}</p> : null}
      </div>
    </div>
  );
}
