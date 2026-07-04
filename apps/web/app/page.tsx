// GREEN obligation (session 014): redirect('/photos') — `/` is no longer a page,
// Photos is the app's home section. The stub renders nothing so the redirect test
// is RED via assertion (never throw: a thrown stub makes vitest exit 2, no coverage).
export default function RootPage() {
  return null;
}
