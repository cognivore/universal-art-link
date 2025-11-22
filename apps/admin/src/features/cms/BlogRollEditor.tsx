import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Textarea } from '../../components/ui/textarea';
import { cn } from '../../lib/utils';
import { joinPath } from './helpers';

type BlogRollEditorProps = {
  readonly basePath: string;
  readonly section: Record<string, unknown>;
  readonly posts: ReadonlyArray<Record<string, unknown>>;
  readonly getValue: (path: string) => unknown;
  readonly onFieldChange: (path: string, value: unknown) => void;
  readonly onListChange: (operation: { type: 'add'; path: string; template: Record<string, unknown> } | { type: 'remove'; path: string; index: number } | { type: 'move'; path: string; index: number; direction: number }) => void;
  readonly selectedPostId: string | null;
  readonly onSelectPost: (postId: string) => void;
  readonly onConfirmRemove?: (itemLabel: string) => Promise<boolean>;
};

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const getPostReferences = (section: Record<string, unknown>): Array<Record<string, unknown>> => {
  const refs = section['posts'];
  return Array.isArray(refs) ? (refs as Record<string, unknown>[]) : [];
};

const buildPostMap = (posts: ReadonlyArray<Record<string, unknown>>): Map<string, Record<string, unknown>> => {
  const map = new Map<string, Record<string, unknown>>();
  posts.forEach((post) => {
    const id = post?.['id'];
    if (typeof id === 'string') {
      map.set(id, post);
    }
  });
  return map;
};

export const BlogRollEditor = ({ basePath, section, posts, getValue, onFieldChange, onListChange, selectedPostId, onSelectPost, onConfirmRemove }: BlogRollEditorProps) => {
  const titlePath = joinPath(basePath, 'title');
  const introPath = joinPath(basePath, 'intro');
  const postsPath = joinPath(basePath, 'posts');
  const references = getPostReferences(section);
  const postMap = buildPostMap(posts);

  const handleRemove = async (index: number) => {
    if (onConfirmRemove) {
      const confirmed = await onConfirmRemove('post');
      if (!confirmed) return;
    }
    onListChange({ type: 'remove', path: postsPath, index });
  };

  const renderReference = (entry: Record<string, unknown>, index: number) => {
    const postId = asString(entry?.['postId']);
    const post = postMap.get(postId);
    const label = post?.['title'] ?? 'Unlinked post';
    const detail = post?.['publishedAt'] ?? 'No publish date';
    const excerpt = post?.['excerpt'];
    const isMissing = !post;
    const isSelected = selectedPostId != null && postId === selectedPostId;

    return (
      <div key={`${postId || 'ref'}-${index}`} className="rounded-2xl border p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            className={cn(
              'flex flex-1 flex-col items-start rounded-xl px-2 py-1 text-left',
              isSelected ? 'bg-muted' : 'bg-transparent',
              isMissing ? 'opacity-60' : 'opacity-100',
            )}
            onClick={() => postId && onSelectPost(postId)}
          >
            <span className="font-semibold">{String(label)}</span>
            <span className="text-sm text-muted-foreground">{String(detail)}</span>
            {typeof excerpt === 'string' && excerpt ? <span className="text-xs text-muted-foreground">{excerpt.slice(0, 120)}{excerpt.length > 120 ? '…' : ''}</span> : null}
            {isMissing ? <span className="text-xs text-red-600">Post not found</span> : null}
          </button>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'move', path: postsPath, index, direction: -1 })} disabled={index === 0}>
              ↑
            </Button>
            <Button variant="ghost" size="sm" onClick={() => onListChange({ type: 'move', path: postsPath, index, direction: 1 })} disabled={index === references.length - 1}>
              ↓
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void handleRemove(index)}>
              Remove
            </Button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1">
            <Label>Section title</Label>
            <Input value={asString(getValue(titlePath))} onChange={(event) => onFieldChange(titlePath, event.target.value)} placeholder="Entries" />
          </div>
          <div className="space-y-1">
            <Label>Intro</Label>
            <Textarea value={asString(getValue(introPath))} onChange={(event) => onFieldChange(introPath, event.target.value)} placeholder="Optional intro for the journal roll." rows={3} />
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Post order</Label>
          <p className="text-sm text-muted-foreground">Click a row to edit the post in the next tab.</p>
        </div>
        {references.length === 0 ? (
          <p className="text-sm text-muted-foreground">No posts are linked yet. Create a post to populate this list.</p>
        ) : (
          <div className="space-y-3" data-testid="blog-post-list">{references.map(renderReference)}</div>
        )}
      </div>
    </div>
  );
};

