'use client';

// GREEN obligation (session 014): render a log-in form (email, password →
// useSession().login) and a sign-up form (display name, email, password →
// useSession().signUp) on shadcn primitives, with an inline role="alert" error on
// a rejected call. No redirect here — the /login page redirects once status becomes
// authenticated. Visual layout is exploratory (smoke-covered).
import { useState, type FormEvent } from 'react';
import { useSession } from '@/lib/session';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Something went wrong. Please try again.';
}

export function LoginScreen() {
  const { login, signUp } = useSession();

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginPending, setLoginPending] = useState(false);

  const [signUpDisplayName, setSignUpDisplayName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');
  const [signUpError, setSignUpError] = useState<string | null>(null);
  const [signUpPending, setSignUpPending] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    setLoginPending(true);
    try {
      await login(loginEmail, loginPassword);
    } catch (err) {
      setLoginError(errorMessage(err));
    } finally {
      setLoginPending(false);
    }
  }

  async function handleSignUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSignUpError(null);
    setSignUpPending(true);
    try {
      await signUp(signUpEmail, signUpPassword, signUpDisplayName);
    } catch (err) {
      setSignUpError(errorMessage(err));
    } finally {
      setSignUpPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="grid w-full max-w-3xl gap-6 rounded-lg border border-border bg-card p-6 shadow-sm sm:grid-cols-2">
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void handleLogin(event);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">Log in</h2>
            <p className="text-sm text-muted-foreground">Sign in to your account.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-email" className="text-sm font-medium">
              E-mail
            </label>
            <Input
              id="login-email"
              type="email"
              autoComplete="email"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="login-password" className="text-sm font-medium">
              Password
            </label>
            <Input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              required
            />
          </div>
          {loginError ? (
            <p role="alert" className="text-sm text-destructive">
              {loginError}
            </p>
          ) : null}
          <Button type="submit" disabled={loginPending}>
            Log in
          </Button>
        </form>

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            void handleSignUp(event);
          }}
        >
          <div>
            <h2 className="text-lg font-semibold">Sign up</h2>
            <p className="text-sm text-muted-foreground">Create a new account.</p>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-display-name" className="text-sm font-medium">
              Display name
            </label>
            <Input
              id="signup-display-name"
              type="text"
              autoComplete="name"
              value={signUpDisplayName}
              onChange={(event) => setSignUpDisplayName(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-email" className="text-sm font-medium">
              Sign-up e-mail
            </label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              value={signUpEmail}
              onChange={(event) => setSignUpEmail(event.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="signup-password" className="text-sm font-medium">
              Sign-up password
            </label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              value={signUpPassword}
              onChange={(event) => setSignUpPassword(event.target.value)}
              required
            />
          </div>
          {signUpError ? (
            <p role="alert" className="text-sm text-destructive">
              {signUpError}
            </p>
          ) : null}
          <Button type="submit" disabled={signUpPending}>
            Sign up
          </Button>
        </form>
      </div>
    </div>
  );
}
