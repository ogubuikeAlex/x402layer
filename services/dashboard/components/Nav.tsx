'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/playground', label: 'Playground' },
  { href: '/docs', label: 'Docs' },
  { href: '/agents', label: 'Agents' },
  { href: '/wallet', label: 'Wallet' },
];

export function Nav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  return (
    <nav className="fixed inset-x-0 top-0 z-50 border-b border-hairline bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
        <Link href="/" className="flex items-center gap-2.5 font-display text-[22px] font-extrabold tracking-tight text-text">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.svg" alt="layer402 logo" className="h-7 w-auto" />
          layer<span className="text-accent">402</span>
        </Link>

        <ul className="hidden items-center gap-9 md:flex">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`text-[11px] uppercase tracking-wide2 transition-colors ${
                    active ? 'text-accent' : 'text-text-dim hover:text-accent'
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
        </ul>

        <Link
          href="/playground"
          className="hidden border border-accent px-5 py-2.5 text-[11px] uppercase tracking-wide2 text-accent transition-colors hover:bg-accent hover:text-bg md:inline-flex"
        >
          Try it live
        </Link>

        <button
          type="button"
          aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-navigation"
          onClick={() => setMenuOpen((open) => !open)}
          className="flex h-11 w-11 flex-col items-center justify-center gap-1.5 border border-hairline bg-surface/50 text-accent transition-colors hover:border-accent md:hidden"
        >
          <span className={`h-px w-5 bg-current transition-transform ${menuOpen ? 'translate-y-2 rotate-45' : ''}`} />
          <span className={`h-px w-5 bg-current transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`h-px w-5 bg-current transition-transform ${menuOpen ? '-translate-y-2 -rotate-45' : ''}`} />
        </button>
      </div>

      <div
        id="mobile-navigation"
        className={`border-t border-hairline bg-bg/95 px-5 pb-5 pt-2 backdrop-blur-xl transition-[max-height,opacity] duration-200 md:hidden ${
          menuOpen ? 'max-h-96 opacity-100' : 'max-h-0 overflow-hidden opacity-0'
        }`}
      >
        <ul className="mx-auto flex max-w-7xl flex-col">
          {LINKS.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <li key={l.href} className="border-b border-hairline last:border-b-0">
                <Link
                  href={l.href}
                  className={`flex items-center justify-between py-4 text-[12px] uppercase tracking-wide2 transition-colors ${
                    active ? 'text-accent' : 'text-text-dim hover:text-accent'
                  }`}
                >
                  <span>{l.label}</span>
                  <span className="text-[10px] text-text-dim">/{l.href === '/' ? '' : l.href.slice(1)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
