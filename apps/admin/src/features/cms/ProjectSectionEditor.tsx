import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { BlockBuilder } from './BlockBuilder';
import { joinPath } from './helpers';

type ProjectSectionEditorProps = {
  readonly basePath: string;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: { type: 'add'; path: string; template: Record<string, unknown> } | { type: 'remove'; path: string; index: number } | { type: 'move'; path: string; index: number; direction: number }) => void;
  readonly onToggleGroup: (path: string, template: Record<string, unknown>) => void;
  readonly onConfirmRemove?: (itemLabel: string) => Promise<boolean>;
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const asStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === 'string' ? item : '')).filter((item) => item != null);
};

const StringListEditor = ({
  label,
  value,
  onChange,
  emptyLabel,
}: {
  readonly label: string;
  readonly value: string[];
  readonly emptyLabel: string;
  readonly onChange: (next: string[]) => void;
}) => (
  <div className="space-y-2 rounded-2xl border border-dashed p-4">
    <div className="flex items-center justify-between">
      <Label>{label}</Label>
      <Button variant="ghost" size="sm" onClick={() => onChange([...value, ''])}>
        Add
      </Button>
    </div>
    {value.length === 0 ? <p className="text-sm text-muted-foreground">{emptyLabel}</p> : null}
    <div className="space-y-2">
      {value.map((item, index) => (
        <div key={`${label}-${index}`} className="flex items-center gap-2">
          <Input
            value={item}
            onChange={(event) => {
              const next = [...value];
              next[index] = event.target.value;
              onChange(next);
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const next = [...value];
              next.splice(index, 1);
              onChange(next);
            }}
          >
            Remove
          </Button>
        </div>
      ))}
    </div>
  </div>
);

export const ProjectSectionEditor = ({ basePath, getValue, onFieldChange, onListChange, onToggleGroup, onConfirmRemove }: ProjectSectionEditorProps) => {
  const title = asString(getValue(joinPath(basePath, 'title')));
  const role = asString(getValue(joinPath(basePath, 'role')));
  const year = asString(getValue(joinPath(basePath, 'year')));
  const tags = asStringArray(getValue(joinPath(basePath, 'tags')));
  const credits = asStringArray(getValue(joinPath(basePath, 'credits')));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-3">
        <div className="space-y-1">
          <Label>Project title</Label>
          <Input value={title} onChange={(event) => onFieldChange(joinPath(basePath, 'title'), event.target.value)} placeholder="Orbit Season 04" />
        </div>
        <div className="space-y-1">
          <Label>Role</Label>
          <Input value={role} onChange={(event) => onFieldChange(joinPath(basePath, 'role'), event.target.value)} placeholder="Creative Direction" />
        </div>
        <div className="space-y-1">
          <Label>Year</Label>
          <Input value={year} onChange={(event) => onFieldChange(joinPath(basePath, 'year'), event.target.value)} placeholder="2025" />
        </div>
      </div>

      <StringListEditor
        label="Tags"
        emptyLabel="No tags yet. Add keywords like typography, realtime, textile."
        value={tags}
        onChange={(next) => onFieldChange(joinPath(basePath, 'tags'), next)}
      />
      <StringListEditor
        label="Credits"
        emptyLabel="No credits listed."
        value={credits}
        onChange={(next) => onFieldChange(joinPath(basePath, 'credits'), next)}
      />

      <div className="space-y-2">
        <div>
          <Label>Blocks</Label>
          <p className="text-sm text-muted-foreground">Compose long-form copy with text, imagery, grids, quotes, and embeds.</p>
        </div>
        <BlockBuilder basePath={basePath} getValue={getValue} onFieldChange={onFieldChange} onListChange={onListChange} onToggleGroup={onToggleGroup} onConfirmRemove={onConfirmRemove} />
      </div>
    </div>
  );
};

