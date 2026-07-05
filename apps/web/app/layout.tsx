import './globals.css';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';

export const metadata = {
  title: 'PhotoOps',
  description: 'Photo management — upload, gallery, clustering, usage'
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
