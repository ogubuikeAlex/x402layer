'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

/**
 * Search box for the agents list. Navigates via router.replace (soft
 * navigation) so the server component re-renders in place - no full page
 * reload. Debounced search-as-you-type; resets to page 1 on a new query.
 */
export function AgentSearch({ initialQuery }: { initialQuery: string }) {
  const router = useRouter();
  const [value, setValue] = useState(initialQuery);
  const [isPending, startTransition] = useTransition();
  const debounce = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(debounce.current), []);

  function navigate(q: string) {
    const trimmed = q.trim();
    startTransition(() => {
      router.replace(trimmed ? `/agents?${new URLSearchParams({ q: trimmed })}` : '/agents', {
        scroll: false,
      });
    });
  }

  function onChange(next: string) {
    setValue(next);
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => navigate(next), 350);
  }

  function clear() {
    clearTimeout(debounce.current);
    setValue('');
    navigate('');
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        clearTimeout(debounce.current);
        navigate(value);
      }}
      className="flex items-center gap-3"
    >
      <div className="relative w-full max-w-sm">
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="search by agent name…"
          className="w-full border border-hairline bg-bg px-3 py-2.5 pr-9 text-sm text-text outline-none focus:border-accent"
        />
        {isPending && (
          <span className="absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 animate-spin rounded-full border-2 border-accent border-t-transparent" />
        )}
      </div>
      <button
        type="submit"
        className="border border-hairline px-5 py-2.5 text-[10px] uppercase tracking-wide2 text-text-dim transition-colors hover:border-accent hover:text-accent"
      >
        Search
      </button>
      {value && (
        <button
          type="button"
          onClick={clear}
          className="text-[10px] uppercase tracking-wide2 text-text-dim transition-colors hover:text-accent"
        >
          clear
        </button>
      )}
    </form>
  );
}
