import type { ComponentType } from 'react';
import { LayoutPanelTop, Palette } from 'lucide-react';
import { cn } from '../../lib/utils';

export type StudioNavView = 'content' | 'site';

type StudioNavProps = {
  readonly value: StudioNavView;
  readonly onChange: (value: StudioNavView) => void;
};

const NAV_ITEMS: Array<{ id: StudioNavView; label: string; description: string; icon: ComponentType<{ className?: string }> }> = [
  { id: 'content', label: 'Content', description: 'Pages & sections', icon: LayoutPanelTop },
  { id: 'site', label: 'Site settings', description: 'Theme & navigation', icon: Palette },
];

export const StudioNav = ({ value, onChange }: StudioNavProps) => (
  <aside className="hidden w-60 flex-shrink-0 flex-col rounded-3xl border bg-card p-4 lg:flex" data-testid="studio-nav">
    <p className="mb-2 text-xs uppercase tracking-[0.3em] text-muted-foreground">Workspace</p>
    <div className="flex flex-col gap-2">
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        const isActive = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            data-testid={`nav-${item.id}`}
            onClick={() => onChange(item.id)}
            className={cn(
              'rounded-2xl border px-3 py-3 text-left transition hover:border-primary/60',
              isActive ? 'border-primary bg-primary/5 text-foreground' : 'border-border text-muted-foreground',
            )}
          >
            <div className="flex items-center gap-3">
              <span className={cn('rounded-full p-2', isActive ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')}>
                <Icon className="h-4 w-4" />
              </span>
              <div>
                <p className="font-semibold">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.description}</p>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  </aside>
);

