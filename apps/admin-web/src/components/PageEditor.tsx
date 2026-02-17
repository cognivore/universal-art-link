import React, { useCallback } from 'react';
import * as Y from 'yjs';
import { BlockEditor } from './BlockEditor.js';
import type { BlockType } from '@ual/core';

type Props = {
  readonly doc: Y.Doc;
  readonly page: Y.Map<unknown>;
  readonly onDelete: () => void;
};

const ADDABLE_BLOCKS: Array<{ type: BlockType; label: string }> = [
  { type: 'hero', label: 'Hero' },
  { type: 'text', label: 'Text' },
  { type: 'image', label: 'Image' },
  { type: 'imageGrid', label: 'Image Grid' },
  { type: 'quote', label: 'Quote' },
  { type: 'embed', label: 'Embed' },
  { type: 'contactForm', label: 'Contact Form' },
];

export const PageEditor: React.FC<Props> = ({ doc, page, onDelete }) => {
  const title = (page.get('title') as string) ?? '';
  const slug = (page.get('slug') as string) ?? '';

  let blocksArr = page.get('blocks') as Y.Array<Y.Map<unknown>> | undefined;
  if (!(blocksArr instanceof Y.Array)) {
    blocksArr = new Y.Array();
    doc.transact(() => page.set('blocks', blocksArr!));
  }
  const blocks = blocksArr;

  const setField = useCallback(
    (key: string, value: string) => doc.transact(() => page.set(key, value)),
    [doc, page],
  );

  const addBlock = useCallback(
    (type: BlockType) => {
      doc.transact(() => {
        const block = new Y.Map();
        block.set('type', type);
        block.set('id', crypto.randomUUID());
        block.set('props', new Y.Map());
        blocks.push([block]);
      });
    },
    [doc, blocks],
  );

  const removeBlock = useCallback(
    (idx: number) => doc.transact(() => blocks.delete(idx, 1)),
    [doc, blocks],
  );

  const moveBlock = useCallback(
    (from: number, to: number) => {
      if (to < 0 || to >= blocks.length) return;
      doc.transact(() => {
        const item = blocks.get(from);
        const clone = new Y.Map();
        item.forEach((value, key) => clone.set(key, value));
        blocks.delete(from, 1);
        blocks.insert(to, [clone]);
      });
    },
    [doc, blocks],
  );

  const blockItems: Y.Map<unknown>[] = [];
  for (let i = 0; i < blocks.length; i++) {
    blockItems.push(blocks.get(i));
  }

  return (
    <div className="panel page-editor">
      <div className="page-header">
        <h2>Page Settings</h2>
        <button type="button" className="btn-danger" onClick={onDelete}>Delete Page</button>
      </div>

      <label>
        Title
        <input value={title} onChange={(e) => setField('title', e.target.value)} />
      </label>
      <label>
        Slug
        <div className="slug-input">
          <span>/</span>
          <input value={slug} onChange={(e) => setField('slug', e.target.value)} />
        </div>
      </label>

      <h3>Blocks ({blockItems.length})</h3>

      <div className="blocks-list">
        {blockItems.map((block, i) => (
          <BlockEditor
            key={(block.get('id') as string) ?? i}
            block={block}
            doc={doc}
            index={i}
            total={blockItems.length}
            onRemove={() => removeBlock(i)}
            onMoveUp={() => moveBlock(i, i - 1)}
            onMoveDown={() => moveBlock(i, i + 1)}
          />
        ))}
      </div>

      <div className="add-block">
        <span>Add block:</span>
        <div className="add-block-buttons">
          {ADDABLE_BLOCKS.map((b) => (
            <button key={b.type} type="button" onClick={() => addBlock(b.type)}>
              + {b.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};
