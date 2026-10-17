import type { ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  Circle,
  CircleHelp,
  CornerDownLeft,
  Eye,
  ShieldCheck,
  TextCursorInput,
  UserRound,
} from 'lucide-react';
import { BrandMark, Icon } from '@/components/ui/icons';
import { PrimaryButton } from '@/components/ui/primitives';

/**
 * The first screen of first-run setup: what ApplyKit does, why it asks for a
 * profile, and that the user stays in control. One screen, then the steps.
 */
export function WelcomeScreen({
  notice,
  onStart,
}: {
  /** A message about previously stored data, shown above the headline. */
  notice?: ReactNode;
  onStart: () => void;
}) {
  return (
    <div className="grid min-h-screen bg-canvas text-ink lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <main className="flex flex-col px-6 py-8 md:px-14 md:py-10">
        <div className="flex items-center gap-2">
          <BrandMark />
          <span className="font-medium">ApplyKit</span>
        </div>

        <div className="my-auto w-full max-w-[480px] py-12">
          {notice && <div className="mb-8">{notice}</div>}

          <h1 className="text-[32px] leading-[38px] font-medium tracking-[-0.02em]">
            Your next application, a little easier.
          </h1>
          <p className="mt-4 max-w-[44ch] text-lg text-ink-2">
            Save your details once. ApplyKit fills the repetitive fields on job
            applications, so you can spend your time on the parts that need you.
          </p>

          <ul className="mt-9 space-y-5">
            <Point icon={UserRound} title="One profile, ready to reuse">
              Your contact details, education, experience and links, entered
              once.
            </Point>
            <Point icon={TextCursorInput} title="Fills what it recognises">
              Open ApplyKit on an application to fill familiar fields and see
              exactly what is left for you.
            </Point>
            <Point icon={Eye} title="You stay in control">
              You review every application. ApplyKit never submits anything for
              you.
            </Point>
          </ul>

          <div className="mt-10 flex flex-wrap items-center gap-x-4 gap-y-3">
            <PrimaryButton onClick={onStart} className="h-9 px-4">
              Get started
              <Icon icon={ArrowRight} size={14} />
            </PrimaryButton>
            <span className="text-xs text-ink-3">
              A few minutes. Optional sections can stay empty.
            </span>
          </div>
        </div>

        <p className="flex items-center gap-2 text-xs text-ink-3">
          <Icon icon={ShieldCheck} size={14} className="shrink-0" />
          Your profile is stored only in this browser. No account, no uploads.
        </p>
      </main>

      <aside
        aria-label="Illustration"
        className="hidden items-center justify-center border-l border-line bg-sunken/50 px-12 py-16 lg:flex"
      >
        <ProductPreview />
      </aside>
    </div>
  );
}

function Point({
  icon,
  title,
  children,
}: {
  icon: Parameters<typeof Icon>[0]['icon'];
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-x-3">
      <Icon icon={icon} size={16} className="mt-0.5 text-accent" />
      <div>
        <p className="text-base font-medium">{title}</p>
        <p className="mt-0.5 text-ink-2">{children}</p>
      </div>
    </li>
  );
}

/**
 * A static, fictional illustration of ApplyKit on an application: the fields
 * it recognises are filled, the rest are left for the user, and the panel
 * says so. Built from the product's own tokens rather than an image.
 */
function ProductPreview() {
  return (
    <figure
      role="img"
      aria-label="Illustration: a fictional job application with name and email filled in by ApplyKit, and the ApplyKit panel listing the fields left for you."
      className="relative w-full max-w-[460px] select-none"
    >
      <div
        aria-hidden
        className="rounded-lg border border-line bg-white p-6 shadow-control"
      >
        <p className="text-xs text-ink-3">Northfield Studio · Careers</p>
        <p className="mt-1 text-lg font-medium tracking-[-0.01em]">
          Product Designer
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-3 gap-y-3.5">
          <PreviewField label="First name" value="Alex" />
          <PreviewField label="Last name" value="Sample" />
          <PreviewField label="Email" value="alex.sample@example.com" wide />
          <PreviewField label="Phone" />
          <PreviewField label="Notice period" />
          <PreviewField label="CV" wide />
        </div>
      </div>

      <div
        aria-hidden
        className="absolute -right-6 -bottom-10 w-[272px] overflow-hidden rounded-lg bg-canvas shadow-panel"
      >
        <div className="flex h-9 items-center gap-2 border-b border-line px-3 text-xs">
          <BrandMark />
          <span className="font-medium">ApplyKit</span>
        </div>
        <div className="px-3 pt-2.5 pb-2 text-xs">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Icon icon={Check} size={14} className="text-success" />
            Filled 3 fields
          </p>
          <p className="mt-0.5 pl-5 text-ink-2">3 left for you</p>
          <ul className="mt-2 space-y-0.5">
            <PreviewRow
              icon={CircleHelp}
              tone="text-warning"
              label="Phone"
              reason="Not recognised"
            />
            <PreviewRow
              icon={Circle}
              tone="text-ink-3"
              label="Notice period"
              reason="Dropdown"
            />
            <PreviewRow
              icon={Circle}
              tone="text-ink-3"
              label="CV"
              reason="File upload"
            />
          </ul>
        </div>
        <div className="flex h-10 items-center justify-between border-t border-line bg-sunken/60 px-3 text-2xs text-ink-3">
          <span className="flex items-center gap-1">
            <Icon icon={ShieldCheck} size={12} />
            Nothing was submitted
          </span>
          <span className="flex items-center gap-1 rounded-sm bg-accent px-2 py-1 text-white">
            Go to first
            <Icon icon={CornerDownLeft} size={11} />
          </span>
        </div>
      </div>
      <figcaption className="sr-only">
        Fictional example. ApplyKit fills only fields it recognises and never
        submits.
      </figcaption>
    </figure>
  );
}

function PreviewField({
  label,
  value,
  wide = false,
}: {
  label: string;
  value?: string;
  wide?: boolean;
}) {
  return (
    <div className={wide ? 'col-span-2' : undefined}>
      <p className="text-2xs font-medium text-ink-2">{label}</p>
      <div className="mt-1 flex h-7 items-center rounded-sm border border-line-strong px-2 text-xs">
        {value ?? ''}
      </div>
    </div>
  );
}

function PreviewRow({
  icon,
  tone,
  label,
  reason,
}: {
  icon: Parameters<typeof Icon>[0]['icon'];
  tone: string;
  label: string;
  reason: string;
}) {
  return (
    <li className="flex h-6 items-center gap-2">
      <Icon icon={icon} size={13} className={tone} />
      <span className="flex-1">{label}</span>
      <span className="text-ink-3">{reason}</span>
    </li>
  );
}
