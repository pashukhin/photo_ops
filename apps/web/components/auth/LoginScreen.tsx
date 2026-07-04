'use client';

// GREEN obligation (session 014): render a log-in form (email, password →
// useSession().login) and a sign-up form (display name, email, password →
// useSession().signUp) on shadcn primitives, with an inline role="alert" error on
// a rejected call. No redirect here — the /login page redirects once status becomes
// authenticated. Visual layout is exploratory (smoke-covered). The stub renders a
// placeholder so the form tests are RED.
export function LoginScreen() {
  return <div data-loginscreen-stub />;
}
