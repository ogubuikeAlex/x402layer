'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Overview' },
  { href: '/playground', label: 'Playground' },
  { href: '/docs', label: 'Docs' },
  { href: '/agents', label: 'Agents' },
  { href: '/wallet', label: 'Wallet' },
];

export function Nav() {
  const pathname = usePathname();
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
          className="border border-accent px-5 py-2.5 text-[11px] uppercase tracking-wide2 text-accent transition-colors hover:bg-accent hover:text-bg"
        >
          Try it live
        </Link>
      </div>
    </nav>
  );
}
