import { redirect } from 'next/navigation';

// GREEN (session 014): `/` is no longer a page — Photos is the app's home
// section. redirect() has return type `never`; returning its value (rather
// than a bare statement) keeps RootPage's inferred return type `never`
// instead of `void`, which is required for it to type as a JSX component.
export default function RootPage(): never {
  return redirect('/photos');
}
