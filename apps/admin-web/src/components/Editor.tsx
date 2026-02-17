import React, { useCallback, useState } from 'react';
import * as Y from 'yjs';
import { getConfigMap, getPagesArray } from '@ual/crdt';
import { SiteConfig } from './SiteConfig.js';
import { PageEditor } from './PageEditor.js';
import { MediaGallery } from './MediaGallery.js';
import { StripePanel } from './StripePanel.js';
import { MetaAdmin } from './MetaAdmin.js';
import type { SyncStatus } from '../types.js';

type View =
  | { kind: 'config' }
  | { kind: 'page'; index: number }
  | { kind: 'media' }
  | { kind: 'stripe' }
  | { kind: 'meta' };

type Props = {
  readonly doc: Y.Doc;
  readonly status: SyncStatus;
  readonly undo: () => void;
  readonly redo: () => void;
  readonly onLogout: () => void;
  readonly onPublish: () => void;
  readonly onSnapshot: (label: string) => void;
  readonly isMetaAdmin?: boolean;
};

export const Editor: React.FC<Props> = ({
  doc, status, undo, redo, onLogout, onPublish, onSnapshot, isMetaAdmin,
}) => {
  const pagesArr = getPagesArray(doc);
  const [view, setView] = useState<View>({ kind: 'config' });
  const [publishing, setPublishing] = useState(false);

  const pageList: Array<{ id: string; title: string; slug: string }> = [];
  for (let i = 0; i < pagesArr.length; i++) {
    const p = pagesArr.get(i);
    pageList.push({
      id: (p.get('id') as string) ?? '',
      title: (p.get('title') as string) ?? 'Untitled',
      slug: (p.get('slug') as string) ?? '',
    });
  }

  const addPage = useCallback(() => {
    doc.transact(() => {
      const page = new Y.Map();
      page.set('id', crypto.randomUUID());
      page.set('slug', 'new-page');
      page.set('title', 'New Page');
      page.set('status', 'draft');
      page.set('seo', new Y.Map());
      page.set('blocks', new Y.Array());
      pagesArr.push([page]);
    });
    setView({ kind: 'page', index: pagesArr.length - 1 });
  }, [doc, pagesArr]);

  const deletePage = useCallback(
    (idx: number) => {
      if (!confirm('Delete this page?')) return;
      doc.transact(() => pagesArr.delete(idx, 1));
      setView({ kind: 'config' });
    },
    [doc, pagesArr],
  );

  const handlePublish = async () => {
    setPublishing(true);
    try {
      await onSnapshot('pre-publish');
      onPublish();
    } finally {
      setTimeout(() => setPublishing(false), 2000);
    }
  };

  const currentPage = view.kind === 'page' && view.index < pagesArr.length
    ? pagesArr.get(view.index)
    : null;

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <h1>UAL</h1>
          <span className={`sync-badge sync-badge--${status}`}>{status}</span>
        </div>

        <nav className="sidebar-nav">
          <div className="nav-section">
            <button
              type="button"
              className={`nav-item ${view.kind === 'config' ? 'nav-item--active' : ''}`}
              onClick={() => setView({ kind: 'config' })}
            >
              ⚙ Site Config
            </button>
          </div>

          <div className="nav-section">
            <div className="nav-section-header">
              <span>Pages</span>
              <button type="button" className="nav-add" onClick={addPage} title="Add page">+</button>
            </div>
            {pageList.map((p, i) => (
              <button
                key={p.id}
                type="button"
                className={`nav-item ${view.kind === 'page' && view.index === i ? 'nav-item--active' : ''}`}
                onClick={() => setView({ kind: 'page', index: i })}
              >
                <span className="nav-page-title">{p.title}</span>
                <span className="nav-page-slug">/{p.slug}</span>
              </button>
            ))}
          </div>

          <div className="nav-section">
            <button
              type="button"
              className={`nav-item ${view.kind === 'media' ? 'nav-item--active' : ''}`}
              onClick={() => setView({ kind: 'media' })}
            >
              🖼 Media
            </button>
            <button
              type="button"
              className={`nav-item ${view.kind === 'stripe' ? 'nav-item--active' : ''}`}
              onClick={() => setView({ kind: 'stripe' })}
            >
              💳 Stripe
            </button>
          </div>

          {isMetaAdmin && (
            <div className="nav-section">
              <div className="nav-section-header"><span>Platform</span></div>
              <button
                type="button"
                className={`nav-item ${view.kind === 'meta' ? 'nav-item--active' : ''}`}
                onClick={() => setView({ kind: 'meta' })}
              >
                🏢 Tenants
              </button>
            </div>
          )}
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-actions">
            <button type="button" onClick={undo} title="Undo">Undo</button>
            <button type="button" onClick={redo} title="Redo">Redo</button>
          </div>
          <div className="sidebar-actions">
            <button type="button" onClick={() => onSnapshot('manual')}>Snapshot</button>
            <button
              type="button"
              className="btn-primary"
              onClick={handlePublish}
              disabled={publishing}
            >
              {publishing ? 'Publishing...' : 'Publish'}
            </button>
          </div>
          <button type="button" className="nav-item nav-logout" onClick={onLogout}>Logout</button>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">
        {view.kind === 'config' && <SiteConfig doc={doc} />}
        {view.kind === 'page' && currentPage && (
          <PageEditor
            doc={doc}
            page={currentPage}
            onDelete={() => deletePage(view.index)}
          />
        )}
        {view.kind === 'media' && <MediaGallery />}
        {view.kind === 'stripe' && <StripePanel />}
        {view.kind === 'meta' && <MetaAdmin />}
      </main>
    </div>
  );
};
