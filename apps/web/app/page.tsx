'use client';

import { FormEvent, useEffect, useState } from 'react';
import { completeUpload, createUploadIntent, listPhotos, PhotoAsset, uploadFileToPresignedUrl } from '../lib/api';

export default function HomePage() {
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [message, setMessage] = useState('Ready');

  async function refreshPhotos() {
    setPhotos(await listPhotos());
  }

  useEffect(() => {
    void refreshPhotos().catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load photos'));
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = form.elements.namedItem('photo') as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) {
      setMessage('Choose a JPEG file first');
      return;
    }
    setMessage('Creating upload intent');
    const intent = await createUploadIntent(file);
    setMessage('Uploading to object storage');
    await uploadFileToPresignedUrl(intent.uploadUrl, file);
    setMessage('Completing upload');
    await completeUpload(intent.photoId);
    await refreshPhotos();
    form.reset();
    setMessage('Upload complete');
  }

  return (
    <main>
      <h1>PhotoOps Architecture Frame</h1>
      <p>This is the first executable frame, not the full MVP. It ends with upload/list.</p>
      <section className="panel">
        <h2>Upload JPEG</h2>
        <form onSubmit={(event) => void onSubmit(event)}>
          <input name="photo" type="file" accept="image/jpeg" />
          <button type="submit">Upload</button>
        </form>
        <p>{message}</p>
      </section>
      <section>
        <h2>Uploaded Photos</h2>
        {photos.length === 0 ? <p>No photos uploaded yet.</p> : null}
        <ul>
          {photos.map((photo) => (
            <li key={photo.id}>
              {photo.filename} - {photo.status}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
