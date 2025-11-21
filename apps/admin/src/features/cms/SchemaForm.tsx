import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { clone } from './helpers';
import type { FieldDefinition, GroupDefinition, ListDefinition } from './helpers';

type SchemaFormProps = {
  readonly basePath: string;
  readonly fields?: ReadonlyArray<FieldDefinition>;
  readonly lists?: ReadonlyArray<ListDefinition>;
  readonly groups?: ReadonlyArray<GroupDefinition>;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: { type: 'add'; path: string; template: Record<string, unknown> } | { type: 'remove'; path: string; index: number } | { type: 'move'; path: string; index: number; direction: number }) => void;
  readonly onToggleGroup: (path: string, template: Record<string, unknown>) => void;
};

export const SchemaForm = ({ basePath, fields = [], lists = [], groups = [], getValue, onFieldChange, onListChange, onToggleGroup }: SchemaFormProps) => (
  <div className="space-y-4">
    {fields.map((field) => (
      <FieldInput key={field.key} field={field} value={getValue(join(basePath, field.key))} onChange={(value) => onFieldChange(join(basePath, field.key), value)} />
    ))}
    {groups.map((group) => (
      <GroupInput
        key={group.key}
        group={group}
        basePath={join(basePath, group.key)}
        value={getValue(join(basePath, group.key))}
        getValue={getValue}
        onFieldChange={onFieldChange}
        onListChange={onListChange}
        onToggleGroup={onToggleGroup}
      />
    ))}
    {lists.map((list) => (
      <ListInput
        key={list.key}
        list={list}
        basePath={join(basePath, list.key)}
        value={getValue(join(basePath, list.key))}
        getValue={getValue}
        onFieldChange={onFieldChange}
        onListChange={onListChange}
        onToggleGroup={onToggleGroup}
      />
    ))}
  </div>
);

type FieldInputProps = {
  readonly field: FieldDefinition;
  readonly value: unknown;
  readonly onChange: (value: unknown) => void;
};

const FieldInput = ({ field, value, onChange }: FieldInputProps) => {
  if (field.type === 'textarea') {
    return (
      <div className="space-y-1">
        <Label>{field.label}</Label>
        <Textarea value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />
      </div>
    );
  }
  if (field.type === 'select' && field.options) {
    return (
      <div className="space-y-1">
        <Label>{field.label}</Label>
        <select
          className="w-full rounded-2xl border border-input bg-transparent px-4 py-2"
          value={String(value ?? field.options[0] ?? '')}
          onChange={(event) => onChange(event.target.value)}
        >
          {field.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    );
  }
  if (field.type === 'checkbox') {
    return (
      <label className="flex items-center gap-2 text-sm font-medium text-foreground">
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        {field.label}
      </label>
    );
  }
  const inputType = field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text';
  return (
    <div className="space-y-1">
      <Label>{field.label}</Label>
      <Input type={inputType} value={String(value ?? '')} placeholder={field.placeholder} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
};

type GroupInputProps = {
  readonly group: GroupDefinition;
  readonly basePath: string;
  readonly value: unknown;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: SchemaFormProps['onFieldChange'];
  readonly onListChange: SchemaFormProps['onListChange'];
  readonly onToggleGroup: SchemaFormProps['onToggleGroup'];
};

const GroupInput = ({ group, basePath, value, getValue, onFieldChange, onListChange, onToggleGroup }: GroupInputProps) => {
  const isActive = value != null;
  return (
    <div className="rounded-2xl border border-dashed px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold">{group.label}</p>
          {group.optional ? <p className="text-xs text-muted-foreground">Optional</p> : null}
        </div>
        {group.optional ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              const template = group.default ? clone(group.default as Record<string, unknown>) : {};
              onToggleGroup(basePath, template);
            }}
          >
            {isActive ? 'Remove' : 'Add'}
          </Button>
        ) : null}
      </div>
      {isActive ? (
        <SchemaForm
          basePath={basePath}
          fields={group.fields}
          lists={group.lists}
          groups={group.groups}
          getValue={getValue}
          onFieldChange={onFieldChange}
          onListChange={onListChange}
          onToggleGroup={onToggleGroup}
        />
      ) : group.optional ? (
        <p className="text-sm text-muted-foreground">Not set.</p>
      ) : (
        <SchemaForm
          basePath={basePath}
          fields={group.fields}
          lists={group.lists}
          groups={group.groups}
          getValue={getValue}
          onFieldChange={onFieldChange}
          onListChange={onListChange}
          onToggleGroup={onToggleGroup}
        />
      )}
    </div>
  );
};

type ListInputProps = {
  readonly list: ListDefinition;
  readonly basePath: string;
  readonly value: unknown;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: SchemaFormProps['onFieldChange'];
  readonly onListChange: SchemaFormProps['onListChange'];
  readonly onToggleGroup: SchemaFormProps['onToggleGroup'];
};

const ListInput = ({ list, basePath, value, getValue, onFieldChange, onListChange, onToggleGroup }: ListInputProps) => {
  const items = Array.isArray(value) ? value : [];
  const template = list.itemTemplate ?? list.default ?? {};

  return (
    <div className="space-y-2 rounded-2xl border border-dashed px-4 py-3">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold">{list.label}</p>
        <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'add', path: basePath, template: template as Record<string, unknown> })}>
          Add {list.itemLabel ?? 'item'}
        </Button>
      </div>
      {items.length === 0 ? <p className="text-sm text-muted-foreground">No entries yet.</p> : null}
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={index} className="rounded-xl border px-3 py-2">
            <div className="mb-2 flex items-center justify-between text-sm font-semibold">
              <span>
                {list.itemLabel ?? 'Item'} {index + 1}
              </span>
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'move', path: basePath, index, direction: -1 })} disabled={index === 0}>
                  ↑
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onListChange({ type: 'move', path: basePath, index, direction: 1 })}
                  disabled={index === items.length - 1}
                >
                  ↓
                </Button>
                <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'remove', path: basePath, index })}>
                  Remove
                </Button>
              </div>
            </div>
            <SchemaForm
              basePath={join(basePath, `${index}`)}
              fields={list.fields}
              lists={list.lists}
              groups={list.groups}
              getValue={getValue}
              onFieldChange={onFieldChange}
              onListChange={onListChange}
              onToggleGroup={onToggleGroup}
            />
          </div>
        ))}
      </div>
    </div>
  );
};

const join = (base: string, key: string | undefined): string => {
  if (!base) return key ?? '';
  if (!key) return base;
  return `${base}.${key}`;
};

