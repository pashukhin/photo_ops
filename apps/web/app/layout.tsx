import './globals.css';
import type { ReactNode } from 'react';

export const metadata = {
  title: 'PhotoOps',
  description: 'Architecture frame upload slice'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
