import type { Metadata } from 'next';

import './globals.css';
import { dmMono, fraunces, syne } from './fonts';
import { Nav } from '@/components/Nav';
import { CustomCursor } from '@/components/CustomCursor';

export const metadata: Metadata = {
  title: 'fourotwo — agent payment facilitator',
  description: 'x402 payment facilitator + agent trust registry',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${syne.variable} ${dmMono.variable} ${fraunces.variable}`}>
      <body>
        <CustomCursor />
        <div className="app-shell">
          <Nav />
          <main className="mx-auto max-w-7xl px-5 pb-24 pt-28 sm:px-6 lg:px-8">{children}</main>
          <footer className="border-t border-hairline px-5 py-8 sm:px-6 lg:px-8">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 text-[10px] uppercase tracking-wide2 text-text-dim sm:flex-row sm:items-center sm:justify-between">
              <span className="font-display text-sm font-extrabold normal-case tracking-normal text-text">
                four<span className="text-accent">otwo</span>
              </span>
              <span>x402 facilitator · agent trust registry · casper testnet</span>
              <span>© 2026 fourotwo</span>
            </div>
          </footer>
        </div>
      </body>
    </html>
  );
}
