import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { SchemaForm } from './SchemaForm';
import type { GroupDefinition } from './types';
import { BlockBuilder } from './BlockBuilder';
import { joinPath } from './helpers';

type BlogPostEditorProps = {
  readonly basePath: string | null;
  readonly post: Record<string, unknown> | null;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: { type: 'add'; path: string; template: Record<string, unknown> } | { type: 'remove'; path: string; index: number } | { type: 'move'; path: string; index: number; direction: number }) => void;
  readonly onToggleGroup: (path: string, template: Record<string, unknown>) => void;
  readonly onCreatePost: () => void;
};

const coverGroup: GroupDefinition = {
  key: 'coverImage',
  label: 'Cover image',
  fields: [
    { key: 'src', label: 'Image URL', type: 'text' },
    { key: 'alt', label: 'Alt text', type: 'text' },
    { key: 'focalPoint', label: 'Focal point', type: 'select', options: ['left', 'center', 'right'], default: 'center' },
  ],
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

export const BlogPostEditor = ({ basePath, post, getValue, onFieldChange, onListChange, onToggleGroup, onCreatePost }: BlogPostEditorProps) => {
  if (!post || !basePath) {
    return (
      <div className="rounded-3xl border border-dashed p-6 text-center" data-testid="blog-post-editor-empty">
        <p className="mb-3 text-lg font-semibold">No post selected</p>
        <p className="mb-4 text-sm text-muted-foreground">Choose a post from the Entries section or create a new one to start editing.</p>
        <Button onClick={onCreatePost}>Create post</Button>
      </div>
    );
  }

  const titlePath = joinPath(basePath, 'title');
  const slugPath = joinPath(basePath, 'slug');
  const excerptPath = joinPath(basePath, 'excerpt');
  const publishedPath = joinPath(basePath, 'publishedAt');

  return (
    <div className="space-y-6" data-testid="blog-post-editor">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Post title</Label>
          <Input value={asString(getValue(titlePath))} onChange={(event) => onFieldChange(titlePath, event.target.value)} placeholder="Vol. 07 — Cyberpunk and us" />
        </div>
        <div className="space-y-1">
          <Label>Slug</Label>
          <Input value={asString(getValue(slugPath))} onChange={(event) => onFieldChange(slugPath, event.target.value)} placeholder="/journal/cyberpunk" />
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <Label>Excerpt</Label>
          <Textarea value={asString(getValue(excerptPath))} onChange={(event) => onFieldChange(excerptPath, event.target.value)} rows={3} placeholder="One-sentence summary shown in the entry list." />
        </div>
        <div className="space-y-1">
          <Label>Publish date</Label>
          <Input type="date" value={asString(getValue(publishedPath))} onChange={(event) => onFieldChange(publishedPath, event.target.value)} />
        </div>
      </div>

      <div className="space-y-2 rounded-2xl border border-dashed p-4">
        <p className="font-semibold">Cover image</p>
        <SchemaForm basePath={basePath} fields={[]} groups={[coverGroup]} getValue={getValue} onFieldChange={onFieldChange} onListChange={onListChange} onToggleGroup={onToggleGroup} />
      </div>

      <div className="space-y-2">
        <div>
          <Label>Post body</Label>
          <p className="text-sm text-muted-foreground">Use the block builder to compose long-form content.</p>
        </div>
        <BlockBuilder basePath={basePath} getValue={getValue} onFieldChange={onFieldChange} onListChange={onListChange} onToggleGroup={onToggleGroup} />
      </div>
    </div>
  );
};

