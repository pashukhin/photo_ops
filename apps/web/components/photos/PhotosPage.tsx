'use client';

import { FormEvent, useState } from 'react';
import { completeUpload, createUploadIntent, uploadFileToPresignedUrl } from '@/lib/api';
import { PhotoGallery } from '@/components/gallery/PhotoGallery';
import { Button } from '@/components/ui/button';

// GREEN obligation (session 014): render <PhotoGallery reloadToken> plus the upload
// action moved verbatim from the old app/page.tsx — a file input + Upload button
// running createUploadIntent → uploadFileToPresignedUrl → completeUpload, then
// bumping reloadToken so the new photo appears. No gallery-internal changes.
export function PhotosPage() {
  // Bumped after a successful upload so <PhotoGallery> refetches and shows the
  // new (processing) photo; the gallery otherwise owns its own data + polling.
  const [reloadToken, setReloadToken] = useState(0);
  const [message, setMessage] = useState('Ready');

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('photo') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setMessage('Choose a JPEG file first');
      return;
    }
    try {
      setMessage('Creating upload intent');
      const intent = await createUploadIntent(file);
      setMessage('Uploading to object storage');
      await uploadFileToPresignedUrl(intent.uploadUrl, file);
      setMessage('Completing upload');
      await completeUpload(intent.photoId);
      setReloadToken((token) => token + 1);
      form.reset();
      setMessage('Upload complete');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Upload photo</h2>
        <form onSubmit={(event) => void onSubmit(event)} className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="photo-upload" className="text-sm text-muted-foreground">
            Upload a JPEG
          </label>
          <input id="photo-upload" name="photo" type="file" accept="image/jpeg" className="text-sm" />
          <Button type="submit">Upload</Button>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
      <PhotoGallery reloadToken={reloadToken} />
    </div>
  );
}
