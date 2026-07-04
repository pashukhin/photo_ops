'use client';

// GREEN obligation (session 014): if useSession().status === 'authenticated' →
// useRouter().replace('/photos') (a logged-in user never sits on /login); else
// render <LoginScreen/>. The stub renders nothing so both cases are RED via
// assertion (never throw: a thrown stub makes vitest exit 2, no coverage written).
export default function LoginPage() {
  return null;
}
