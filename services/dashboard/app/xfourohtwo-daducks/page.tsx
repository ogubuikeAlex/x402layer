'use client';

import { useState } from 'react';

import { Badge } from '@/components/docs';
import { TABS } from '@/components/docs-content';

export default function InternalDocsPage() {
  const [active, setActive] = useState(TABS[0]!.id);
  const tab = TABS.find((t) => t.id === active)!;

  return (
    <div className="space-y-10">
      <header>
        <div className="section-label mb-4">internal · developer docs</div>
        <h1 className="section-heading mb-4">
          Build notes.
          <br />
          Architecture &amp; milestones.
        </h1>
        <p className="max-w-xl font-serif text-[16px] font-light leading-relaxed text-text-mid">
          Internal engineering reference — milestones, ADR decisions, contract internals, and the
          full build surface. Looking to integrate fourotwo into your own app? See the{' '}
          <a href="/docs" className="text-accent underline">
            platform docs
          </a>{' '}
          instead.
        </p>
      </header>

      <div className="grid gap-8 md:grid-cols-[220px_1fr]">
        {/* tab list */}
        <aside className="md:sticky md:top-28 md:self-start">
          <nav className="flex gap-1 overflow-x-auto border border-hairline bg-surface/40 p-1 md:flex-col">
            {TABS.map((t) => {
              const on = t.id === active;
              return (
                <button
                  key={t.id}
                  onClick={() => setActive(t.id)}
                  className={`flex shrink-0 items-center justify-between gap-2 px-3 py-2.5 text-left text-[12px] uppercase tracking-wide2 transition-colors md:shrink ${
                    on
                      ? 'bg-accent/15 text-accent md:border-l-2 md:border-accent'
                      : 'text-text-dim hover:bg-surface2 hover:text-text'
                  }`}
                >
                  <span>{t.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* content */}
        <article className="min-w-0">
          <div className="mb-6 flex items-center gap-3 border-b border-hairline pb-4">
            <h2 className="font-display text-lg font-bold text-text">{tab.label}</h2>
            <Badge status={tab.status} />
            <span className="ml-auto hidden text-[11px] text-text-dim sm:block">{tab.blurb}</span>
          </div>
          <div key={tab.id} className="fade-up">
            {tab.content}
          </div>
        </article>
      </div>
    </div>
  );
}
