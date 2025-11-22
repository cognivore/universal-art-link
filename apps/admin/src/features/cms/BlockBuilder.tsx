import { useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { SchemaForm } from './SchemaForm';
import { blockDefinitionList, blockDefinitions } from './blockDefinitions';
import type { BlockDefinition } from './types';
import { joinPath } from './helpers';

type BlockBuilderProps = {
  readonly basePath: string;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: { type: 'add'; path: string; template: Record<string, unknown> } | { type: 'remove'; path: string; index: number } | { type: 'move'; path: string; index: number; direction: number }) => void;
  readonly onToggleGroup: (path: string, template: Record<string, unknown>) => void;
  readonly onConfirmRemove?: (itemLabel: string) => Promise<boolean>;
};

type BlockValue = {
  readonly type?: string;
};

const blockPickerId = (basePath: string) => `${basePath.replace(/\./g, '-')}-block-picker`;

export const BlockBuilder = ({ basePath, getValue, onFieldChange, onListChange, onToggleGroup, onConfirmRemove }: BlockBuilderProps) => {
  const blocksPath = joinPath(basePath, 'blocks');
  const blocksValue = getValue(blocksPath);
  const blocks = Array.isArray(blocksValue) ? (blocksValue as BlockValue[]) : [];
  const [selectedType, setSelectedType] = useState<string>(blockDefinitionList[0]?.type ?? 'text');
  const pickerId = useMemo(() => blockPickerId(basePath), [basePath]);

  const handleAdd = () => {
    const definition = blockDefinitions[selectedType] ?? blockDefinitionList[0];
    if (!definition) return;
    onListChange({ type: 'add', path: blocksPath, template: definition.template });
  };

  const renderBlockActions = (index: number) => (
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'move', path: blocksPath, index, direction: -1 })} disabled={index === 0}>
        ↑
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'move', path: blocksPath, index, direction: 1 })} disabled={index === blocks.length - 1}>
        ↓
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={async () => {
          if (onConfirmRemove) {
            const confirmed = await onConfirmRemove('block');
            if (!confirmed) return;
          }
          onListChange({ type: 'remove', path: blocksPath, index });
        }}
      >
        Remove
      </Button>
    </div>
  );

  const renderBlockForm = (block: BlockValue, index: number) => {
    const definition: BlockDefinition | undefined = block?.type ? blockDefinitions[block.type] : undefined;
    const blockBasePath = joinPath(blocksPath, String(index));
    return (
      <div key={`${block?.type ?? 'unknown'}-${index}`} className="space-y-4 rounded-3xl border border-dashed p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">{block?.type ?? 'Custom block'}</p>
            <h4 className="text-lg font-semibold">{definition?.label ?? 'Custom block'}</h4>
            {definition?.description ? <p className="text-sm text-muted-foreground">{definition.description}</p> : null}
          </div>
          {renderBlockActions(index)}
        </div>
        <SchemaForm
          basePath={blockBasePath}
          fields={definition?.fields}
          groups={definition?.groups}
          lists={definition?.lists}
          getValue={getValue}
          onFieldChange={onFieldChange}
          onListChange={onListChange}
          onToggleGroup={onToggleGroup}
          onConfirmRemove={onConfirmRemove}
        />
      </div>
    );
  };

  return (
    <div className="space-y-4" data-testid="block-builder">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="space-y-1">
          <Label htmlFor={pickerId}>Block type</Label>
          <select
            id={pickerId}
            data-testid="block-picker"
            className="min-w-[200px] rounded-2xl border border-input bg-transparent px-4 py-2 text-sm"
            value={selectedType}
            onChange={(event) => setSelectedType(event.target.value)}
          >
            {blockDefinitionList.map((definition) => (
              <option key={definition.type} value={definition.type}>
                {definition.label}
              </option>
            ))}
          </select>
        </div>
        <Button onClick={handleAdd} data-testid="add-block-button">Add block</Button>
      </div>
      {blocks.length === 0 ? <p className="text-sm text-muted-foreground">No blocks yet. Add one to start composing the case study.</p> : null}
      <div className="space-y-4">{blocks.map(renderBlockForm)}</div>
    </div>
  );
};

