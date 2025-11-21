import { Button } from '../../components/ui/button';
import { cn } from '../../lib/utils';
import type { ContentPage } from './types';

type PageSidebarProps = {
  readonly pages: ContentPage[];
  readonly selectedIndex: number;
  readonly onSelect: (index: number) => void;
  readonly onAddPage: () => void;
  readonly onDeletePage: () => void;
};

export const PageSidebar = ({ pages, selectedIndex, onSelect, onAddPage, onDeletePage }: PageSidebarProps) => (
  <div className="flex h-full flex-col rounded-3xl border bg-card" data-testid="page-sidebar">
    <div className="flex items-center justify-between px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Pages</p>
        <p className="text-sm text-muted-foreground">{pages.length} total</p>
      </div>
      <Button size="sm" data-testid="add-page-button" onClick={onAddPage}>
        Add page
      </Button>
    </div>
    <div className="flex-1 divide-y overflow-auto">
      {pages.map((page, index) => {
        const title = String(page.data?.title ?? `Page ${index + 1}`);
        const slug = String(page.data?.slug ?? '/');
        return (
          <button
            key={`${slug}-${index}`}
            type="button"
            onClick={() => onSelect(index)}
            className={cn(
              'flex flex-col items-start gap-1 px-4 py-3 text-left transition hover:bg-muted/60',
              index === selectedIndex ? 'bg-muted/60' : 'bg-transparent',
            )}
          >
            <span className="font-semibold">{title}</span>
            <span className="text-sm text-muted-foreground">{slug}</span>
          </button>
        );
      })}
      {pages.length === 0 ? (
        <div className="px-4 py-3 text-sm text-muted-foreground">No pages yet. Add one above.</div>
      ) : null}
    </div>
    <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
      <span className="text-muted-foreground">Danger</span>
      <Button variant="destructive" size="sm" data-testid="delete-page-button" onClick={onDeletePage} disabled={pages.length <= 1}>
        Delete current
      </Button>
    </div>
  </div>
);

