'use client';

import { FormEvent, useEffect, useState } from 'react';
import { completeUpload, createUploadIntent, CurrentUser, getCurrentUser, listPhotos, login, logout, PhotoAsset, signUp, uploadFileToPresignedUrl } from '../lib/api';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [photos, setPhotos] = useState<PhotoAsset[]>([]);
  const [message, setMessage] = useState('Ready');

  async function refreshPhotos() {
    setPhotos(await listPhotos());
  }

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
        if (user) {
          void refreshPhotos();
        }
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Failed to load session'));
  }, []);

  async function onSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
      const user = await signUp({ email, password, displayName });
      setCurrentUser(user);
      await refreshPhotos();
      form.reset();
      setMessage('Signed up');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Sign up failed');
    }
  }

  async function onLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const form = event.currentTarget;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const user = await login({ email, password });
      setCurrentUser(user);
      await refreshPhotos();
      form.reset();
      setMessage('Logged in');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    }
  }

  async function onLogout() {
    await logout();
    setCurrentUser(null);
    setPhotos([]);
    setMessage('Logged out');
  }

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
      await refreshPhotos();
      form.reset();
      setMessage('Upload complete');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Upload failed');
    }
  }

  return (
    <main>
      <h1>PhotoOps Architecture Frame</h1>
      <p>This is the first executable frame, not the full MVP. It ends with upload/list.</p>
      {currentUser ? (
        <>
          <section className="panel">
            <h2>Signed in</h2>
            <p>
              {currentUser.displayName} ({currentUser.email})
            </p>
            <button type="button" onClick={() => void onLogout()}>
              Log out
            </button>
          </section>
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
        </>
      ) : (
        <section className="panel">
          <h2>Sign up or log in</h2>
          <form onSubmit={(event) => void onSignup(event)}>
            <h3>Create account</h3>
            <input name="displayName" placeholder="Display name" />
            <input name="email" placeholder="E-mail" type="email" />
            <input name="password" placeholder="Password" type="password" />
            <button type="submit">Sign up</button>
          </form>
          <form onSubmit={(event) => void onLogin(event)}>
            <h3>Log in</h3>
            <input name="email" placeholder="E-mail" type="email" />
            <input name="password" placeholder="Password" type="password" />
            <button type="submit">Log in</button>
          </form>
          <p>{message}</p>
        </section>
      )}
    </main>
  );
}
