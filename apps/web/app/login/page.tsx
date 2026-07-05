'use client';

// GREEN (session 014): an already-authenticated visitor must never sit on
// /login, so redirect them to /photos as a side effect once status settles;
// otherwise render the login/sign-up screen.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/lib/session';
import { LoginScreen } from '@/components/auth/LoginScreen';

export default function LoginPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'authenticated') {
      router.replace('/photos');
    }
  }, [status, router]);

  if (status === 'authenticated') {
    return null;
  }

  return <LoginScreen />;
}
