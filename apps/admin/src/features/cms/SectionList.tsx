import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import type { SchemaDefinition, ContentPage } from './types';
import { SchemaForm } from './SchemaForm';
import type { SectionDefinition } from './types';
import { Textarea } from '../../components/ui/textarea';

type ListOperation =
  | { type: 'add'; path: string; template: Record<string, unknown> }
  | { type: 'remove'; path: string; index: number }
  | { type: 'move'; path: string; index: number; direction: number };

type SectionListProps = {
  readonly page: ContentPage | undefined;
  readonly schema: SchemaDefinition | null;
  readonly schemaMap: Map<string, SectionDefinition>;
  readonly pageIndex: number;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: ListOperation) => void;
  readonly onToggleGroup: (path: string, template: Record<string, unknown>) => void;
  readonly onAddSection: (sectionType: string) => void;
  readonly onRemoveSection: (index: number) => Promise<void>;
  readonly onMoveSection: (index: number, direction: number) => void;
  readonly getValue: (path: string) => unknown;
  readonly onConfirmRemove?: (itemLabel: string) => Promise<boolean>;
};

type SchemaFormProps = React.ComponentProps<typeof SchemaForm>;

export const SectionList = ({
  page,
  schema,
  schemaMap,
  pageIndex,
  onFieldChange,
  onListChange,
  onToggleGroup,
  onAddSection,
  onRemoveSection,
  onMoveSection,
  getValue,
  onConfirmRemove,
}: SectionListProps) => {
  const sections = Array.isArray(page?.data?.sections) ? page?.data.sections : [];
  const availableSections = schema?.sections ?? [];
  const pickerId = `section-picker-${pageIndex}`;

  return (
    <div className="space-y-4" data-testid="section-list">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="uppercase tracking-[0.3em] text-xs text-muted-foreground">Sections</p>
          <p className="text-sm text-muted-foreground">{sections.length} blocks</p>
        </div>
        <div className="flex items-center gap-2">
          <select id={pickerId} data-testid="section-picker" className="rounded-2xl border px-3 py-2 text-sm" defaultValue={availableSections[0]?.type}>
            {availableSections.map((section) => (
              <option key={section.type} value={section.type}>
                {section.label ?? section.type}
              </option>
            ))}
          </select>
          <Button
            data-testid="add-section-button"
            onClick={() => {
              const select = document.getElementById(pickerId) as HTMLSelectElement | null;
              const value = select?.value ?? availableSections[0]?.type;
              if (value) {
                onAddSection(value);
              }
            }}
          >
            Add section
          </Button>
        </div>
      </div>
      {sections.length === 0 ? <p className="text-muted-foreground">No sections yet. Use the picker above to add one.</p> : null}
      <div className="space-y-4">
        {sections.map((section, index) => {
          const def = schemaMap.get(String(section.type));
          const basePath = `pages.${pageIndex}.data.sections.${index}`;
          const isJsonMode = def?.mode === 'json';
          return (
            <div key={`${section.type}-${index}`} className="rounded-3xl border border-dashed p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{section.type}</p>
                  <h3 className="text-lg font-semibold">{def?.label ?? 'Custom section'}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => onMoveSection(index, -1)} disabled={index === 0}>
                    ↑
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onMoveSection(index, 1)} disabled={index === sections.length - 1}>
                    ↓
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => void onRemoveSection(index)}>
                    Remove
                  </Button>
                </div>
              </div>
              {isJsonMode ? (
                <div className="space-y-2">
                  <Label>JSON payload</Label>
                  <Textarea
                    className="font-mono text-xs"
                    rows={10}
                    defaultValue={JSON.stringify(section, null, 2)}
                    onChange={(event) => {
                      try {
                        const parsed = JSON.parse(event.target.value);
                        onFieldChange(basePath, parsed);
                        event.currentTarget.classList.remove('border-red-500');
                      } catch {
                        event.currentTarget.classList.add('border-red-500');
                      }
                    }}
                  />
                </div>
              ) : (
                <SchemaForm basePath={basePath} fields={def?.fields} lists={def?.lists} groups={def?.groups} getValue={getValue} onFieldChange={onFieldChange} onListChange={onListChange} onToggleGroup={onToggleGroup} onConfirmRemove={onConfirmRemove} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

