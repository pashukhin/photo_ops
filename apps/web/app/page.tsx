'use client';

import React from 'react';
import { FormEvent, useEffect, useState } from 'react';
import { completeUpload, createUploadIntent, CurrentUser, getCurrentUser, login, logout, signUp, uploadFileToPresignedUrl } from '../lib/api';
import { PhotoGallery } from '../components/gallery/PhotoGallery';

export default function HomePage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  // Bumped after a successful upload so <PhotoGallery> refetches and shows the
  // new (processing) photo; the gallery otherwise owns its own data + polling.
  const [reloadToken, setReloadToken] = useState(0);
  const [message, setMessage] = useState('Ready');

  useEffect(() => {
    void getCurrentUser()
      .then((user) => {
        setCurrentUser(user);
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
      form.reset();
      setMessage('Logged in');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Login failed');
    }
  }

  async function onLogout() {
    await logout();
    setCurrentUser(null);
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
      setReloadToken((token) => token + 1);
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
      <p><a href="/usage">View usage report →</a></p>
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
            <h2>Your photos</h2>
            <PhotoGallery reloadToken={reloadToken} />
          </section>
        </>
      ) : (
        <section className="panel">
          <h2>Sign up or log in</h2>
          <p role="alert" aria-live="polite">
            {message}
          </p>
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
        </section>
      )}
    </main>
  );
}
