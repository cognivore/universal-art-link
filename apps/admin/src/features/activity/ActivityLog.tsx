import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { ScrollArea } from '../../components/ui/scroll-area';
import { cn } from '../../lib/utils';
import type { LogEntry } from '../../hooks/useAdminConsole';

export type ActivityLogProps = {
  entries: LogEntry[];
  onClear: () => void;
};

export const ActivityLog = ({ entries, onClear }: ActivityLogProps) => {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3">
        <div>
          <CardDescription className="uppercase tracking-[0.3em] text-xs">Activity</CardDescription>
          <CardTitle>Admin log</CardTitle>
        </div>
        <Button size="sm" variant="outline" onClick={onClear}>
          Clear
        </Button>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-56">
          <ul className="space-y-3">
            {entries.length === 0 ? (
              <li className="text-sm text-muted-foreground">No activity yet.</li>
            ) : (
              entries.map((entry) => (
                <li
                  key={entry.id}
                  className={cn(
                    'rounded-2xl border px-4 py-2 text-sm font-medium',
                    entry.variant === 'success' && 'border-emerald-200 bg-emerald-50 text-emerald-700',
                    entry.variant === 'error' && 'border-red-200 bg-red-50 text-red-600',
                    entry.variant === 'info' && 'border-muted bg-muted/40 text-foreground'
                  )}
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{entry.at}</p>
                  <p>{entry.message}</p>
                </li>
              ))
            )}
          </ul>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

