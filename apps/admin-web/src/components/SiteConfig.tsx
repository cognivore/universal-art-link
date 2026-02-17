import React, { useCallback } from 'react';
import * as Y from 'yjs';
import { getConfigMap } from '@ual/crdt';

type Props = { readonly doc: Y.Doc };

const getOrCreateMap = (parent: Y.Map<unknown>, key: string): Y.Map<unknown> => {
  let m = parent.get(key) as Y.Map<unknown> | undefined;
  if (!(m instanceof Y.Map)) {
    m = new Y.Map();
    parent.set(key, m);
  }
  return m;
};

export const SiteConfig: React.FC<Props> = ({ doc }) => {
  const config = getConfigMap(doc);

  const get = (key: string) => (config.get(key) as string) ?? '';

  const set = useCallback(
    (key: string, value: string) => doc.transact(() => config.set(key, value)),
    [doc, config],
  );

  const palette = getOrCreateMap(config, 'palette');
  const getPalette = (key: string) => (palette.get(key) as string) ?? '';
  const setPalette = useCallback(
    (key: string, value: string) => doc.transact(() => palette.set(key, value)),
    [doc, palette],
  );

  const typography = getOrCreateMap(config, 'typography');
  const getTypo = (key: string) => (typography.get(key) as string) ?? '';
  const setTypo = useCallback(
    (key: string, value: string) => doc.transact(() => typography.set(key, value)),
    [doc, typography],
  );

  return (
    <div className="panel">
      <h2>Site Config</h2>

      <fieldset>
        <legend>General</legend>
        <label>
          Title
          <input value={get('title')} onChange={(e) => set('title', e.target.value)} />
        </label>
        <label>
          Description
          <textarea value={get('description')} onChange={(e) => set('description', e.target.value)} />
        </label>
        <label>
          Favicon URL
          <input value={get('favicon')} onChange={(e) => set('favicon', e.target.value)} placeholder="https://..." />
        </label>
      </fieldset>

      <fieldset>
        <legend>Palette</legend>
        <div className="color-grid">
          {(['primary', 'secondary', 'accent', 'background', 'text'] as const).map((key) => (
            <label key={key}>
              {key}
              <div className="color-input">
                <input
                  type="color"
                  value={getPalette(key) || '#000000'}
                  onChange={(e) => setPalette(key, e.target.value)}
                />
                <input
                  type="text"
                  value={getPalette(key)}
                  onChange={(e) => setPalette(key, e.target.value)}
                  placeholder="#000000"
                  className="color-text"
                />
              </div>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend>Typography</legend>
        <label>
          Heading Font
          <input value={getTypo('headingFont')} onChange={(e) => setTypo('headingFont', e.target.value)} placeholder="system-ui" />
        </label>
        <label>
          Body Font
          <input value={getTypo('bodyFont')} onChange={(e) => setTypo('bodyFont', e.target.value)} placeholder="system-ui" />
        </label>
        <label>
          Base Size (px)
          <input
            type="number"
            value={getTypo('baseSize') || '16'}
            onChange={(e) => setTypo('baseSize', e.target.value)}
          />
        </label>
      </fieldset>
    </div>
  );
};
