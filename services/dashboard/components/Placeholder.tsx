import { Reveal } from '@/components/Reveal';

export function Placeholder({
  title,
  ticket,
  children,
}: {
  title: string;
  ticket: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-8">
      <Reveal>
        <div className="section-label mb-4">{ticket}</div>
        <h1 className="section-heading">{title}</h1>
      </Reveal>
      <Reveal delay={80}>
        <div className="relative overflow-hidden border border-dashed border-hairline bg-surface/40 p-10">
          <span className="pointer-events-none absolute -right-2 top-2 font-display text-[120px] font-extrabold leading-none text-white/[0.03]">
            soon
          </span>
          <div className="relative max-w-xl font-serif text-[15px] font-light leading-relaxed text-text-mid">
            {children}
          </div>
        </div>
      </Reveal>
    </div>
  );
}
