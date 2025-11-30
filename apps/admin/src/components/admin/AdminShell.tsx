import type { PropsWithChildren } from 'react';
import { Separator } from '../ui/separator';
import { cn } from '../../lib/utils';
import { SantaBanner } from './SantaBanner';

type AdminShellProps = PropsWithChildren<{
  className?: string;
  onNavigateSettings?: () => void;
}>;

export const AdminShell = ({ children, className, onNavigateSettings }: AdminShellProps) => (
  <div className={cn('flex min-h-screen w-full flex-col gap-8 bg-[#f7eadf] px-6 py-10 lg:px-10', className)}>
    <SantaBanner onNavigateSettings={onNavigateSettings} />
    <header className="space-y-3">
      <p className="uppercase tracking-[0.35em] text-xs text-muted-foreground">UAL Service Suite</p>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-semibold">Admin control room</h1>
          <p className="text-muted-foreground">Editorial CMS for your Cargo-style sites.</p>
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

