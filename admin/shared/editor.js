const UAL_EDITOR = (() => {
  const config = window.UAL_EDITOR_CONFIG ?? {};
  const mountId = config.mountId ?? 'ual-editor';
  const apiBase = config.apiBase ?? '/api';
  const root = document.getElementById(mountId);
  if (!root) {
    return null;
  }

  const state = {
    loading: true,
    saving: false,
    dirty: false,
    error: null,
    status: null,
    schema: null,
    schemaMap: new Map(),
    content: null,
    selectedPage: 0,
    previewVisible: true,
    previewDevice: 'desktop',
    previewVersion: Date.now(),
    previewBase: config.previewBase ?? window.location.origin,
    rebuildPromise: null,
    rebuildResolve: null
  };

  const waitForRebuild = () => {
    if (state.rebuildPromise) {
      return state.rebuildPromise;
    }
    state.rebuildPromise = new Promise((resolve) => {
      state.rebuildResolve = resolve;
    });
    const timeout = setTimeout(() => {
      if (state.rebuildResolve) {
        state.rebuildResolve();
        state.rebuildPromise = null;
        state.rebuildResolve = null;
      }
    }, 5000);
    state.rebuildPromise.finally(() => clearTimeout(timeout));
    return state.rebuildPromise;
  };

  const handleRebuildComplete = () => {
    if (state.rebuildResolve) {
      state.rebuildResolve();
      state.rebuildPromise = null;
      state.rebuildResolve = null;
    }
  };

  // Listen to dev server rebuild notifications
  (() => {
    try {
      const previewBase = state.previewBase ?? window.location.origin;
      const baseUrl = previewBase.endsWith('/') ? previewBase.slice(0, -1) : previewBase;
      const liveReloadUrl = `${baseUrl}/__ual/live`;
      const liveSource = new EventSource(liveReloadUrl);
      liveSource.addEventListener('message', (event) => {
        if (event.data === 'reload') {
          handleRebuildComplete();
        }
      });
      liveSource.addEventListener('error', () => {
        // Silently handle EventSource errors (server may not be running)
      });
    } catch (error) {
      // EventSource not supported or failed to initialize
    }
  })();

  const escapeHtml = (value = '') =>
    String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  const pathSegments = (path) =>
    path
      .split('.')
      .filter(Boolean)
      .map((segment) => {
        if (/^\d+$/.test(segment)) {
          return Number(segment);
        }
        return segment;
      });

  const getByPath = (target, path) => {
    if (!target || !path) return undefined;
    return pathSegments(path).reduce((acc, key) => {
      if (acc == null) return undefined;
      return acc[key];
    }, target);
  };

  const ensureContainer = (parent, key, nextKey) => {
    if (parent[key] == null) {
      if (typeof nextKey === 'number') {
        parent[key] = [];
      } else {
        parent[key] = {};
      }
    }
  };

  const setByPath = (target, path, value) => {
    if (!path) return;
    const segments = pathSegments(path);
    if (!segments.length) return;
    let pointer = target;
    for (let i = 0; i < segments.length - 1; i += 1) {
      const key = segments[i];
      const nextKey = segments[i + 1];
      if (pointer[key] == null || typeof pointer[key] !== 'object') {
        ensureContainer(pointer, key, nextKey);
      }
      pointer = pointer[key];
    }
    pointer[segments.at(-1)] = value;
  };

  const deleteByPath = (target, path) => {
    const segments = pathSegments(path);
    if (!segments.length) return;
    const lastKey = segments.pop();
    const parent = getByPath(target, segments.join('.'));
    if (parent == null) return;
    if (Array.isArray(parent) && typeof lastKey === 'number') {
      parent.splice(lastKey, 1);
    } else {
      delete parent[lastKey];
    }
  };

  const cloneTemplate = (template) => JSON.parse(JSON.stringify(template ?? {}));

  const encodeTemplate = (template) => encodeURIComponent(JSON.stringify(template ?? {}));

  const decodeTemplate = (value) => {
    if (!value) return {};
    try {
      return JSON.parse(decodeURIComponent(value));
    } catch {
      return {};
    }
  };

  const joinPath = (base, key) => {
    if (!base) return key;
    if (!key) return base;
    return `${base}.${key}`;
  };

  const getSelectedPage = () => state.content?.pages?.[state.selectedPage];

  const normalizeSlug = (slug) => {
    if (!slug) return '/';
    return slug.startsWith('/') ? slug : `/${slug}`;
  };

  const buildPreviewUrl = () => {
    const base = state.previewBase ?? window.location.origin;
    const trimmedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    const slug = normalizeSlug(getSelectedPage()?.data?.slug ?? '/');
    const version = state.previewVersion ?? 0;
    const url = `${trimmedBase}${slug}`;
    if (!version) {
      return url;
    }
    const separator = url.includes('?') ? '&' : '?';
    return `${url}${separator}v=${version}`;
  };

  const syncPreviewFrame = (force = false) => {
    if (!state.previewVisible) return;
    const frame = root.querySelector('[data-preview-frame]');
    if (!frame) return;
    const nextUrl = buildPreviewUrl();
    if (force || frame.dataset.loadedUrl !== nextUrl) {
      frame.dataset.loadedUrl = nextUrl;
      frame.src = nextUrl;
    }
  };

  const markDirty = () => {
    state.dirty = true;
    renderStatus();
  };

  const setStatus = (message, variant = 'muted') => {
    state.status = { message, variant };
    renderStatus();
  };

  const clearStatus = () => {
    state.status = null;
    renderStatus();
  };

  const buildSchemaMap = () => {
    state.schemaMap.clear();
    (state.schema?.sections ?? []).forEach((section) => {
      state.schemaMap.set(section.type, section);
    });
  };

  const buildDefaultFromFields = (fields = [], groups = []) => {
    const next = {};
    fields.forEach((field) => {
      if (field.type === 'checkbox') {
        next[field.key] = Boolean(field.default ?? false);
      } else if (field.type === 'list') {
        next[field.key] = [];
      } else if (field.type === 'group') {
        next[field.key] = {};
      } else {
        next[field.key] = field.default ?? '';
      }
    });
    groups.forEach((group) => {
      if (group.default != null) {
        next[group.key] = cloneTemplate(group.default);
      }
    });
    return next;
  };

  const buildSectionTemplate = (sectionType) => {
    const def = state.schemaMap.get(sectionType);
    if (!def) {
      return { type: sectionType };
    }
    const template = cloneTemplate(def.defaults ?? { type: sectionType });
    template.type = sectionType;
    if (!template.type) template.type = sectionType;
    const hasFields = def.fields ?? [];
    hasFields.forEach((field) => {
      if (template[field.key] == null) {
        template[field.key] = field.default ?? (field.type === 'checkbox' ? false : '');
      }
    });
    (def.lists ?? []).forEach((list) => {
      if (!Array.isArray(template[list.key])) {
        template[list.key] = [];
      }
    });
    (def.groups ?? []).forEach((group) => {
      if (template[group.key] == null && group.default) {
        template[group.key] = cloneTemplate(group.default);
      }
    });
    return template;
  };

  const fetchContent = async () => {
    state.loading = true;
    render();
    try {
      const response = await fetch(`${apiBase}/content`);
      if (!response.ok) {
        throw new Error(`Content API error (${response.status})`);
      }
      const payload = await response.json();
      state.schema = payload.schema ?? null;
      buildSchemaMap();
      state.content = payload.content ?? { site: {}, pages: [] };
      state.selectedPage = 0;
      state.loading = false;
      state.dirty = false;
      state.error = null;
      setStatus('Loaded content schema', 'success');
      render();
    } catch (error) {
      state.loading = false;
      state.error = error instanceof Error ? error.message : String(error);
      setStatus(state.error, 'error');
      render();
    }
  };

  const saveContent = async () => {
    if (!state.content) return;
    state.saving = true;
    setStatus('Saving content…', 'muted');
    renderStatus();
    try {
      const response = await fetch(`${apiBase}/content`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state.content, null, 2)
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || 'Failed to save content');
      }
      state.saving = false;
      state.dirty = false;
      setStatus('Content saved, rebuilding site…', 'muted');
      // Wait for the dev server rebuild to complete before refreshing preview
      await waitForRebuild();
      state.previewVersion = Date.now();
      syncPreviewFrame(true);
      setStatus('Preview updated', 'success');
    } catch (error) {
      state.saving = false;
      setStatus(error instanceof Error ? error.message : String(error), 'error');
    }
    renderStatus();
  };

  const siteFieldPath = (key) => joinPath('site', key);

  const pageFieldPath = (pageIndex, key) => joinPath(`pages.${pageIndex}.data`, key);

  const sectionFieldPath = (pageIndex, sectionIndex, key) =>
    joinPath(`pages.${pageIndex}.data.sections.${sectionIndex}`, key);

  const renderField = (field, value, basePath) => {
    const path = joinPath(basePath, field.key);
    const placeholder = field.placeholder ? ` placeholder="${escapeHtml(field.placeholder)}"` : '';
    const common = ` data-path="${escapeHtml(path)}"`;
    if (field.type === 'textarea') {
      return `
        <div class="ual-field">
          <label>${escapeHtml(field.label)}</label>
          <textarea${common}${placeholder}>${escapeHtml(value ?? '')}</textarea>
        </div>
      `;
    }
    if (field.type === 'select') {
      const options = (field.options ?? []).map(
        (option) => `<option value="${escapeHtml(option)}"${option === value ? ' selected' : ''}>${escapeHtml(option)}</option>`
      );
      return `
        <div class="ual-field">
          <label>${escapeHtml(field.label)}</label>
          <select${common}>
            ${options.join('')}
          </select>
        </div>
      `;
    }
    if (field.type === 'checkbox') {
      return `
        <div class="ual-field">
          <label>
            <input type="checkbox"${common} ${value ? 'checked' : ''} />
            ${escapeHtml(field.label)}
          </label>
        </div>
      `;
    }
    const inputType = field.type === 'color' ? 'color' : field.type === 'number' ? 'number' : 'text';
    return `
      <div class="ual-field">
        <label>${escapeHtml(field.label)}</label>
        <input type="${inputType}"${common}${placeholder} value="${escapeHtml(value ?? '')}" />
      </div>
    `;
  };

  const renderGroupField = (group, value, basePath) => {
    const path = joinPath(basePath, group.key);
    const templateAttr = encodeTemplate(group.default ?? buildDefaultFromFields(group.fields, group.groups));
    const controls = `
      <button class="ual-editor__button ual-editor__button--ghost" data-action="toggle-group" data-path="${escapeHtml(
        path
      )}" data-template="${templateAttr}">
        ${value ? 'Remove' : 'Add'}
      </button>
    `;
    if (!value) {
      return `
        <div class="ual-field">
          <div class="ual-list__header">
            <span>${escapeHtml(group.label)}</span>
            ${controls}
          </div>
          <p class="ual-muted">Not set.</p>
        </div>
      `;
    }
    const content = (group.fields ?? [])
      .map((field) => renderField(field, value[field.key], path))
      .join('');
    const nestedLists = (group.lists ?? []).map((list) => renderListField(list, value[list.key], path)).join('');
    const nestedGroups = (group.groups ?? []).map((child) => renderGroupField(child, value[child.key], path)).join('');
    return `
      <div class="ual-field">
        <div class="ual-list__header">
          <span>${escapeHtml(group.label)}</span>
          ${controls}
        </div>
        ${content}
        ${nestedGroups}
        ${nestedLists}
      </div>
    `;
  };

  const renderListField = (def, items, basePath) => {
    const path = joinPath(basePath, def.key);
    const safeItems = Array.isArray(items) ? items : [];
    const template = def.itemTemplate ?? def.default ?? buildDefaultFromFields(def.fields, def.groups);
    const templateAttr = encodeTemplate(template);
    const listItems = safeItems
      .map((item, index) => renderListItem(def, item, path, index, safeItems.length))
      .join('');
    return `
      <div class="ual-field">
        <div class="ual-list__header">
          <span>${escapeHtml(def.label)}</span>
          <div class="ual-section__controls">
            <button class="ual-editor__button ual-editor__button--ghost" data-action="add-list-item" data-path="${escapeHtml(
              path
            )}" data-template="${templateAttr}">
              Add ${escapeHtml(def.itemLabel ?? 'Item')}
            </button>
          </div>
        </div>
        <div class="ual-list">
          ${
            safeItems.length
              ? listItems
              : `<p class="ual-muted">No ${escapeHtml((def.itemLabel ?? 'items').toLowerCase())} yet.</p>`
          }
        </div>
      </div>
    `;
  };

  const renderListItem = (def, item, path, index, total) => {
    const itemPath = `${path}.${index}`;
    const controls = `
      <div class="ual-section__controls">
        <button class="ual-editor__button ual-editor__button--ghost" data-action="move-list-item" data-path="${escapeHtml(
          path
        )}" data-index="${index}" data-direction="-1" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="ual-editor__button ual-editor__button--ghost" data-action="move-list-item" data-path="${escapeHtml(
          path
        )}" data-index="${index}" data-direction="1" ${index === total - 1 ? 'disabled' : ''}>↓</button>
        <button class="ual-editor__button ual-editor__button--ghost" data-action="remove-list-item" data-path="${escapeHtml(
          path
        )}" data-index="${index}">Remove</button>
      </div>
    `;
    const fields = (def.fields ?? []).map((field) => renderField(field, item[field.key], itemPath)).join('');
    const nestedLists = (def.lists ?? []).map((list) => renderListField(list, item[list.key], itemPath)).join('');
    const nestedGroups = (def.groups ?? []).map((group) => renderGroupField(group, item[group.key], itemPath)).join('');
    return `
      <div class="ual-list__item">
        <div class="ual-list__header">
          <strong>${escapeHtml(def.itemLabel ?? 'Item')} ${index + 1}</strong>
          ${controls}
        </div>
        ${fields}
        ${nestedGroups}
        ${nestedLists}
      </div>
    `;
  };

  const renderSitePanel = () => {
    if (!state.schema?.site) {
      return '';
    }
    const siteFields = (state.schema.site.fields ?? [])
      .map((field) => renderField(field, getByPath(state.content, siteFieldPath(field.key)), 'site'))
      .join('');
    const siteLists = (state.schema.site.lists ?? [])
      .map((list) => renderListField(list, getByPath(state.content, siteFieldPath(list.key)), 'site'))
      .join('');
    return `
      <section>
        <h3 class="ual-editor__title">${escapeHtml(state.schema.site.title ?? 'Site')}</h3>
        ${siteFields}
        ${siteLists}
      </section>
    `;
  };

  const renderPagesPanel = () => {
    const pages = state.content?.pages ?? [];
    const items = pages
      .map((page, index) => {
        const slug = page?.data?.slug ?? '(no slug)';
        const title = page?.data?.title ?? `Page ${index + 1}`;
        return `
          <button class="ual-page-item ${index === state.selectedPage ? 'ual-page-item--active' : ''}" data-action="select-page" data-index="${index}">
            <strong>${escapeHtml(title)}</strong>
            <p class="ual-page-item__meta">${escapeHtml(slug)}</p>
          </button>
        `;
      })
      .join('');
    return `
      <section>
        <div class="ual-editor__title">Pages</div>
        <div class="ual-page-list">
          ${items || '<p class="ual-muted">No pages yet.</p>'}
        </div>
        <button class="ual-editor__button ual-editor__button--primary" data-action="add-page">Add page</button>
      </section>
    `;
  };

  const renderSection = (section, sectionIndex, pageIndex) => {
    const def = state.schemaMap.get(section.type);
    const path = `pages.${pageIndex}.data.sections.${sectionIndex}`;
    const controls = `
      <div class="ual-section__controls">
        <button class="ual-editor__button ual-editor__button--ghost" data-action="move-section" data-direction="-1" data-section="${sectionIndex}" ${sectionIndex === 0 ? 'disabled' : ''}>↑</button>
        <button class="ual-editor__button ual-editor__button--ghost" data-action="move-section" data-direction="1" data-section="${sectionIndex}" ${sectionIndex === (state.content?.pages?.[pageIndex]?.data?.sections?.length ?? 0) - 1 ? 'disabled' : ''}>↓</button>
        <button class="ual-editor__button ual-editor__button--ghost" data-action="remove-section" data-section="${sectionIndex}">Remove</button>
      </div>
    `;
    if (!def || def.mode === 'json') {
      const jsonValue = JSON.stringify(section, null, 2);
      return `
        <div class="ual-section">
          <div class="ual-section__header">
            <div>
              <p class="ual-chip">${escapeHtml(section.type || 'section')}</p>
              <h4 class="ual-section__title">${escapeHtml(def?.label ?? 'Custom section')}</h4>
            </div>
            ${controls}
          </div>
          <p class="ual-muted">Editing via JSON. Ensure valid structure before saving.</p>
          <textarea class="ual-jsonarea" data-json-path="${escapeHtml(path)}">${escapeHtml(jsonValue)}</textarea>
        </div>
      `;
    }
    const bodyFields = (def.fields ?? [])
      .map((field) => renderField(field, section[field.key], path))
      .join('');
    const listFields = (def.lists ?? [])
      .map((list) => renderListField(list, section[list.key], path))
      .join('');
    const groupFields = (def.groups ?? [])
      .map((group) => renderGroupField(group, section[group.key], path))
      .join('');
    return `
      <div class="ual-section">
        <div class="ual-section__header">
          <div>
            <p class="ual-chip">${escapeHtml(section.type)}</p>
            <h4 class="ual-section__title">${escapeHtml(def.label ?? section.type)}</h4>
          </div>
          ${controls}
        </div>
        ${def.description ? `<p class="ual-muted">${escapeHtml(def.description)}</p>` : ''}
        ${bodyFields}
        ${groupFields}
        ${listFields}
      </div>
    `;
  };

  const renderPageDetail = () => {
    const pages = state.content?.pages ?? [];
    const page = pages[state.selectedPage];
    if (!page) {
      return `<div class="ual-empty">Select or add a page to start editing.</div>`;
    }
    const pageFields = (state.schema?.page?.fields ?? [])
      .map((field) => renderField(field, getByPath(state.content, pageFieldPath(state.selectedPage, field.key)), `pages.${state.selectedPage}.data`))
      .join('');
    const sections = Array.isArray(page.data?.sections)
      ? page.data.sections.map((section, index) => renderSection(section, index, state.selectedPage)).join('')
      : '<p class="ual-muted">No sections yet.</p>';
    const sectionOptions = (state.schema?.sections ?? [])
      .map((section) => `<option value="${escapeHtml(section.type)}">${escapeHtml(section.label ?? section.type)}</option>`)
      .join('');
    return `
      <div>
        <div class="ual-section__header" style="margin-bottom:1rem;">
          <div>
            <p class="ual-chip">Page</p>
            <h3 class="ual-section__title">${escapeHtml(page.data?.title ?? 'Untitled')}</h3>
          </div>
          <button class="ual-editor__button ual-editor__button--ghost" data-action="delete-page" ${pages.length <= 1 ? 'disabled' : ''}>Delete page</button>
        </div>
        ${pageFields}
        <hr style="border: none; border-top: 1px solid var(--editor-border); margin: 1.5rem 0;" />
        <div>
          <div class="ual-section__header" style="margin-bottom:1rem;">
            <h3 class="ual-section__title">Sections</h3>
            <div class="ual-section__controls">
              <select data-control="section-picker" class="ual-editor__button">
                ${sectionOptions}
              </select>
              <button class="ual-editor__button ual-editor__button--primary" data-action="add-section">Add section</button>
            </div>
          </div>
          ${sections}
          ${
            page.data?.sections?.length
              ? ''
              : '<p class="ual-empty">No sections yet. Use “Add section” to start composing.</p>'
          }
        </div>
      </div>
    `;
  };

  const renderPreviewPane = () => {
    if (!state.previewVisible) {
      return '';
    }
    const slug = normalizeSlug(getSelectedPage()?.data?.slug ?? '/');
    const deviceButtons = ['desktop', 'tablet', 'mobile']
      .map((device) => {
        const active = state.previewDevice === device ? 'is-active' : '';
        const label = device === 'desktop' ? 'Desktop' : device === 'tablet' ? 'Tablet' : 'Mobile';
        return `<button class="${active}" data-action="set-preview-device" data-device="${device}">${label}</button>`;
      })
      .join('');
    const iframeClasses = ['ual-preview__iframe'];
    if (state.previewDevice === 'tablet') {
      iframeClasses.push('ual-preview__iframe--tablet');
    } else if (state.previewDevice === 'mobile') {
      iframeClasses.push('ual-preview__iframe--mobile');
    }
    return `
      <section class="ual-editor__pane ual-editor__pane--preview">
        <div class="ual-preview__header">
          <div>
            <p class="ual-chip">Preview</p>
            <p class="ual-muted">${escapeHtml(slug)}</p>
          </div>
          <div class="ual-editor__actions">
            <div class="ual-preview__device">
              ${deviceButtons}
            </div>
            <button class="ual-editor__button ual-editor__button--ghost" data-action="reload-preview">Reload</button>
          </div>
        </div>
        <div style="flex:1;display:flex;align-items:center;justify-content:center;padding:1rem;">
          <iframe class="${iframeClasses.join(' ')}" data-preview-frame title="Site preview"></iframe>
        </div>
      </section>
    `;
  };

  const renderStatus = () => {
    const statusEl = root.querySelector('[data-editor-status]');
    if (!statusEl) return;
    const classes = ['ual-editor__status'];
    if (state.status) {
      classes.push(`ual-editor__status--${state.status.variant}`);
      statusEl.textContent = state.status.message;
    } else if (state.dirty) {
      classes.push('ual-editor__status--dirty');
      statusEl.textContent = 'Unsaved changes';
    } else {
      statusEl.textContent = 'In sync';
    }
    statusEl.className = classes.join(' ');
  };

  const render = () => {
    if (state.loading) {
      root.innerHTML = `<div class="ual-editor"><p class="ual-muted">Loading schema…</p></div>`;
      return;
    }
    if (state.error) {
      root.innerHTML = `<div class="ual-editor"><p class="ual-editor__status ual-editor__status--error">${escapeHtml(
        state.error
      )}</p><button class="ual-editor__button ual-editor__button--primary" data-action="refresh">Retry</button></div>`;
      return;
    }
    root.classList.remove('ual-editor--hidden');
    const surfaceClasses = ['ual-editor__surface'];
    if (!state.previewVisible) {
      surfaceClasses.push('ual-editor__surface--stack');
    }
    const previewPane = state.previewVisible ? renderPreviewPane() : '';
    root.innerHTML = `
      <div class="ual-editor">
        <div class="ual-editor__header">
          <div>
            <p class="ual-editor__title">Content studio</p>
            <p class="ual-editor__status" data-editor-status></p>
          </div>
          <div class="ual-editor__actions">
            <button class="ual-editor__button" data-action="toggle-preview">${state.previewVisible ? 'Hide preview' : 'Show preview'}</button>
            <button class="ual-editor__button" data-action="refresh">Refresh</button>
            <button class="ual-editor__button ual-editor__button--primary" data-action="save" ${
              state.saving ? 'disabled' : ''
            }>${state.saving ? 'Saving…' : 'Save changes'}</button>
          </div>
        </div>
        <div class="${surfaceClasses.join(' ')}">
          <aside class="ual-editor__pane ual-editor__pane--sidebar">
            ${renderSitePanel()}
            ${renderPagesPanel()}
          </aside>
          <section class="ual-editor__pane ual-editor__pane--main">
            ${renderPageDetail()}
          </section>
          ${previewPane}
        </div>
      </div>
    `;
    renderStatus();
    syncPreviewFrame();
  };

  const ensureSelectedPage = () => {
    const pages = state.content?.pages ?? [];
    if (state.selectedPage >= pages.length) {
      state.selectedPage = Math.max(0, pages.length - 1);
    }
  };

  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const path = target.dataset.path;
    if (path) {
      let value = target.value;
      if (target instanceof HTMLInputElement && target.type === 'checkbox') {
        value = target.checked;
      }
      setByPath(state.content, path, value);
      markDirty();
      return;
    }
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    const jsonPath = target.dataset.jsonPath;
    if (jsonPath) {
      try {
        const parsed = JSON.parse(target.value);
        setByPath(state.content, jsonPath, parsed);
        target.classList.remove('ual-jsonarea--error');
        markDirty();
      } catch {
        target.classList.add('ual-jsonarea--error');
        setStatus('Invalid JSON in section', 'error');
      }
      return;
    }
  });

  root.addEventListener('click', (event) => {
    const button = event.target.closest('[data-action]');
    if (!(button instanceof HTMLElement)) {
      return;
    }
    const { action } = button.dataset;
    if (!action) return;
    event.preventDefault();

    switch (action) {
      case 'refresh':
        fetchContent();
        return;
      case 'save':
        saveContent();
        return;
      case 'toggle-preview':
        state.previewVisible = !state.previewVisible;
        render();
        return;
      case 'reload-preview':
        state.previewVersion = Date.now();
        syncPreviewFrame(true);
        return;
      case 'set-preview-device':
        state.previewDevice = button.dataset.device ?? 'desktop';
        render();
        return;
      case 'select-page':
        state.selectedPage = Number(button.dataset.index ?? 0);
        render();
        return;
      case 'add-page':
        addPage();
        return;
      case 'delete-page':
        deletePage();
        return;
      case 'add-section':
        addSection();
        return;
      case 'remove-section':
        removeSection(Number(button.dataset.section ?? 0));
        return;
      case 'move-section':
        moveSection(Number(button.dataset.section ?? 0), Number(button.dataset.direction ?? 0));
        return;
      case 'add-list-item':
        modifyList(button.dataset.path, { type: 'add', template: button.dataset.template });
        return;
      case 'remove-list-item':
        modifyList(button.dataset.path, { type: 'remove', index: Number(button.dataset.index ?? 0) });
        return;
      case 'move-list-item':
        modifyList(button.dataset.path, {
          type: 'move',
          index: Number(button.dataset.index ?? 0),
          direction: Number(button.dataset.direction ?? 0)
        });
        return;
      case 'toggle-group':
        toggleGroup(button.dataset.path, decodeTemplate(button.dataset.template));
        return;
      default:
        return;
    }
  });

  const addPage = () => {
    const defaults = cloneTemplate(state.schema?.page?.defaults ?? {});
    const nextPages = state.content?.pages ?? [];
    nextPages.push({
      data: { ...defaults, sections: defaults.sections ?? [] }
    });
    state.selectedPage = nextPages.length - 1;
    markDirty();
    render();
  };

  const deletePage = () => {
    const pages = state.content?.pages ?? [];
    if (pages.length <= 1) {
      setStatus('Keep at least one page.', 'error');
      return;
    }
    pages.splice(state.selectedPage, 1);
    ensureSelectedPage();
    markDirty();
    render();
  };

  const addSection = () => {
    const picker = root.querySelector('[data-control="section-picker"]');
    if (!(picker instanceof HTMLSelectElement)) {
      return;
    }
    const type = picker.value;
    if (!type) return;
    const pages = state.content?.pages ?? [];
    const page = pages[state.selectedPage];
    if (!page) return;
    if (!Array.isArray(page.data?.sections)) {
      page.data.sections = [];
    }
    page.data.sections.push(buildSectionTemplate(type));
    markDirty();
    render();
  };

  const removeSection = (sectionIndex) => {
    const page = state.content?.pages?.[state.selectedPage];
    if (!page?.data?.sections) return;
    page.data.sections.splice(sectionIndex, 1);
    markDirty();
    render();
  };

  const moveSection = (sectionIndex, direction) => {
    if (!direction) return;
    const page = state.content?.pages?.[state.selectedPage];
    if (!page?.data?.sections) return;
    const targetIndex = sectionIndex + direction;
    if (targetIndex < 0 || targetIndex >= page.data.sections.length) return;
    const [item] = page.data.sections.splice(sectionIndex, 1);
    page.data.sections.splice(targetIndex, 0, item);
    markDirty();
    render();
  };

  const modifyList = (path, operation) => {
    if (!path) return;
    const target = getByPath(state.content, path);
    if (!Array.isArray(target)) {
      setByPath(state.content, path, []);
    }
    const list = getByPath(state.content, path);
    if (!Array.isArray(list)) return;

    if (operation.type === 'add') {
      const template = decodeTemplate(operation.template);
      list.push(cloneTemplate(template));
      markDirty();
      render();
      return;
    }
    if (operation.type === 'remove') {
      list.splice(operation.index, 1);
      markDirty();
      render();
      return;
    }
    if (operation.type === 'move') {
      const nextIndex = operation.index + operation.direction;
      if (nextIndex < 0 || nextIndex >= list.length) return;
      const [item] = list.splice(operation.index, 1);
      list.splice(nextIndex, 0, item);
      markDirty();
      render();
    }
  };

  const toggleGroup = (path, template) => {
    if (!path) return;
    const current = getByPath(state.content, path);
    if (current == null) {
      setByPath(state.content, path, cloneTemplate(template));
    } else {
      deleteByPath(state.content, path);
    }
    markDirty();
    render();
  };

  fetchContent();
  return {
    reload: fetchContent,
    save: saveContent
  };
})();

