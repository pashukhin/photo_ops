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
    const files = input.files ? Array.from(input.files) : [];
    if (files.length === 0) {
      setMessage('Choose a JPEG file first');
      return;
    }
    // Sequential + resilient: each file runs the full intent→PUT→complete flow;
    // a failed file is recorded (name — reason) and the batch continues. Bump
    // reloadToken after each success so photos appear as they finish.
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i];
      setMessage(`Uploading ${i + 1} of ${files.length}…`);
      try {
        const intent = await createUploadIntent(file);
        await uploadFileToPresignedUrl(intent.uploadUrl, file);
        await completeUpload(intent.photoId);
        ok += 1;
        setReloadToken((token) => token + 1);
      } catch (error) {
        const reason = error instanceof Error ? error.message : 'upload failed';
        failures.push(`${file.name} — ${reason}`);
      }
    }
    form.reset();
    const summary = `Uploaded ${ok} of ${files.length}.`;
    setMessage(failures.length > 0 ? `${summary} Failed: ${failures.join(', ')}` : summary);
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-lg border bg-card p-4">
        <h2 className="text-sm font-semibold">Upload photo</h2>
        <form onSubmit={(event) => void onSubmit(event)} className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor="photo-upload" className="text-sm text-muted-foreground">
            Upload JPEGs
          </label>
          <input
            id="photo-upload"
            name="photo"
            type="file"
            accept="image/jpeg"
            multiple
            className="text-sm"
          />
          <Button type="submit">Upload</Button>
        </form>
        <p className="mt-2 text-sm text-muted-foreground">{message}</p>
      </section>
      <PhotoGallery reloadToken={reloadToken} />
    </div>
  );
}
