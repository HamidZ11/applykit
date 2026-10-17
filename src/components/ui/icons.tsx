import type { LucideIcon, LucideProps } from 'lucide-react';

/**
 * Renders a Lucide icon with ApplyKit's fixed optical rules: 1.5px strokes
 * at any size, so 14px and 16px icons share one visual weight.
 */
export function Icon({
  icon: Glyph,
  size = 16,
  ...props
}: { icon: LucideIcon; size?: number } & Omit<LucideProps, 'ref'>) {
  return (
    <Glyph
      aria-hidden
      size={size}
      strokeWidth={1.5}
      nonScalingStroke
      {...props}
    />
  );
}

/** ApplyKit's provisional mark: a form row being completed. */
export function BrandMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="size-[18px] shrink-0">
      <rect width="18" height="18" rx="5" className="fill-accent" />
      <path
        d="M5 6.5h8M5 11.5h3.25"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="m10.25 11.4 1.4 1.35 2.35-2.6"
        fill="none"
        stroke="white"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
