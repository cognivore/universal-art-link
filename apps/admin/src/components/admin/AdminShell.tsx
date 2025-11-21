import type { PropsWithChildren } from 'react';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';

type AdminShellProps = PropsWithChildren<{
  className?: string;
}>;

export const AdminShell = ({ children, className }: AdminShellProps) => (
  <div className={cn('mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-10', className)}>
    <header className="space-y-3">
      <p className="uppercase tracking-[0.35em] text-xs text-muted-foreground">UAL Service Suite</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Admin control room</h1>
          <p className="text-muted-foreground">Deploy, preview, and orchestrate new sites with Strapi-backed onboarding.</p>
        </div>
        <div className="rounded-full border border-dashed border-border px-4 py-2 text-sm text-muted-foreground">
          Crafted with shadcn/ui
        </div>
      </div>
    </header>
    <Separator className="bg-border" />
    {children}
  </div>
);

