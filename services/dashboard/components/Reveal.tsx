'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Scroll-reveal wrapper (design.md §6). Children start hidden and fade/slide up
 * when scrolled into view, with an optional stagger delay.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: keyof JSX.IntrinsicElements;
}) {
  const ref = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let timer: ReturnType<typeof setTimeout>;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          timer = setTimeout(() => setVisible(true), delay);
          io.disconnect();
        }
      },
      { threshold: 0.1 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      clearTimeout(timer);
    };
  }, [delay]);

  const Comp = Tag as unknown as React.ElementType;
  return (
    <Comp ref={ref} className={`reveal ${visible ? 'visible' : ''} ${className}`}>
      {children}
    </Comp>
  );
}
