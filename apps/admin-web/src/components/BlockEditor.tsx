import React, { useCallback } from 'react';
import * as Y from 'yjs';
import { ImagePicker } from './MediaGallery.js';
import type { MediaAsset } from '../api.js';

type BlockEditorProps = {
  readonly block: Y.Map<unknown>;
  readonly doc: Y.Doc;
  readonly index: number;
  readonly total: number;
  readonly onRemove: () => void;
  readonly onMoveUp: () => void;
  readonly onMoveDown: () => void;
};

const getProps = (block: Y.Map<unknown>): Y.Map<unknown> => {
  let p = block.get('props') as Y.Map<unknown> | undefined;
  if (!(p instanceof Y.Map)) {
    p = new Y.Map();
    block.set('props', p);
  }
  return p;
};

const useProp = (doc: Y.Doc, block: Y.Map<unknown>) => {
  const props = getProps(block);
  const get = (key: string): string => (props.get(key) as string) ?? '';
  const set = (key: string, value: unknown) =>
    doc.transact(() => props.set(key, value));
  return { props, get, set };
};

const BLOCK_LABELS: Record<string, string> = {
  hero: 'Hero',
  text: 'Text',
  image: 'Image',
  imageGrid: 'Image Grid',
  quote: 'Quote',
  embed: 'Embed',
  contactForm: 'Contact Form',
  projectsGrid: 'Projects Grid',
  blogRoll: 'Blog Roll',
};

const HeroEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>Heading<input value={get('heading')} onChange={(e) => set('heading', e.target.value)} /></label>
      <label>Subheading<input value={get('subheading')} onChange={(e) => set('subheading', e.target.value)} /></label>
      <label>CTA Label<input value={get('ctaLabel')} onChange={(e) => set('ctaLabel', e.target.value)} /></label>
      <label>CTA URL<input value={get('ctaUrl')} onChange={(e) => set('ctaUrl', e.target.value)} placeholder="https://..." /></label>
      <label>
        Hero Image
        <ImagePicker
          currentUrl={get('imageUrl') || undefined}
          onSelect={(a: MediaAsset) => { set('imageId', a.id); set('imageUrl', a.url); }}
        />
      </label>
    </>
  );
};

const TextEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>
        Body
        <textarea
          value={get('body')}
          onChange={(e) => set('body', e.target.value)}
          rows={6}
          placeholder="Write your content here..."
        />
      </label>
      <label>
        Alignment
        <select value={get('alignment') || 'left'} onChange={(e) => set('alignment', e.target.value)}>
          <option value="left">Left</option>
          <option value="center">Center</option>
          <option value="right">Right</option>
        </select>
      </label>
    </>
  );
};

const ImageEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>
        Image
        <ImagePicker
          currentUrl={get('imageUrl') || undefined}
          onSelect={(a: MediaAsset) => { set('mediaId', a.id); set('imageUrl', a.url); }}
        />
      </label>
      <label>Alt text<input value={get('alt')} onChange={(e) => set('alt', e.target.value)} /></label>
      <label>Caption<input value={get('caption')} onChange={(e) => set('caption', e.target.value)} /></label>
      <label className="checkbox-label">
        <input type="checkbox" checked={get('fullBleed') === 'true'} onChange={(e) => set('fullBleed', String(e.target.checked))} />
        Full bleed
      </label>
    </>
  );
};

const ImageGridEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { props, get, set } = useProp(doc, block);

  let images = props.get('images') as Y.Array<Y.Map<unknown>> | undefined;
  if (!(images instanceof Y.Array)) {
    images = new Y.Array();
    doc.transact(() => props.set('images', images!));
  }
  const imgList = images;

  const addImage = (asset: MediaAsset) => {
    doc.transact(() => {
      const img = new Y.Map();
      img.set('mediaId', asset.id);
      img.set('url', asset.url);
      img.set('alt', '');
      img.set('caption', '');
      imgList.push([img]);
    });
  };

  const removeImage = (idx: number) => doc.transact(() => imgList.delete(idx, 1));

  const items: Array<{ url: string; alt: string }> = [];
  for (let i = 0; i < imgList.length; i++) {
    const m = imgList.get(i);
    items.push({ url: (m.get('url') as string) ?? '', alt: (m.get('alt') as string) ?? '' });
  }

  return (
    <>
      <label>
        Columns
        <input type="number" min="1" max="6" value={get('columns') || '3'} onChange={(e) => set('columns', e.target.value)} />
      </label>
      <div className="grid-preview">
        {items.map((item, i) => (
          <div key={i} className="grid-thumb">
            <img src={item.url} alt={item.alt} />
            <button type="button" className="remove-btn" onClick={() => removeImage(i)}>&times;</button>
          </div>
        ))}
      </div>
      <ImagePicker onSelect={addImage} />
    </>
  );
};

const QuoteEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>Quote<textarea value={get('text')} onChange={(e) => set('text', e.target.value)} rows={3} /></label>
      <label>Attribution<input value={get('attribution')} onChange={(e) => set('attribution', e.target.value)} /></label>
    </>
  );
};

const EmbedEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>URL<input value={get('url')} onChange={(e) => set('url', e.target.value)} placeholder="https://youtube.com/watch?v=..." /></label>
      <label>Caption<input value={get('caption')} onChange={(e) => set('caption', e.target.value)} /></label>
    </>
  );
};

const ContactFormEditor: React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }> = ({ doc, block }) => {
  const { get, set } = useProp(doc, block);
  return (
    <>
      <label>Heading<input value={get('heading')} onChange={(e) => set('heading', e.target.value)} /></label>
      <label>Receive at email<input type="email" value={get('email')} onChange={(e) => set('email', e.target.value)} /></label>
      <label>Description<textarea value={get('description')} onChange={(e) => set('description', e.target.value)} rows={2} /></label>
    </>
  );
};

const EDITORS: Record<string, React.FC<{ doc: Y.Doc; block: Y.Map<unknown> }>> = {
  hero: HeroEditor,
  text: TextEditor,
  image: ImageEditor,
  imageGrid: ImageGridEditor,
  quote: QuoteEditor,
  embed: EmbedEditor,
  contactForm: ContactFormEditor,
};

export const BlockEditor: React.FC<BlockEditorProps> = ({
  block, doc, index, total, onRemove, onMoveUp, onMoveDown,
}) => {
  const type = (block.get('type') as string) ?? 'text';
  const Editor = EDITORS[type];
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <div className="block-editor">
      <div className="block-header">
        <button type="button" className="block-collapse" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? '▸' : '▾'}
        </button>
        <span className="block-type-label">{BLOCK_LABELS[type] ?? type}</span>
        <div className="block-controls">
          <button type="button" disabled={index === 0} onClick={onMoveUp} title="Move up">↑</button>
          <button type="button" disabled={index === total - 1} onClick={onMoveDown} title="Move down">↓</button>
          <button type="button" className="block-remove" onClick={onRemove} title="Delete block">×</button>
        </div>
      </div>
      {!collapsed && (
        <div className="block-body">
          {Editor ? <Editor doc={doc} block={block} /> : <p>No editor for block type "{type}"</p>}
        </div>
      )}
    </div>
  );
};
