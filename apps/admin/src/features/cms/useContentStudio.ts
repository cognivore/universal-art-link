import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AdminRuntimeConfig } from '../../lib/runtime-config';
import { getPreviewCandidates } from '../../lib/runtime-config';
import { clone, buildSchemaMap, buildSectionTemplate, deleteByPath, getByPath, joinPath, setByPath } from './helpers';
import type { ContentPage, ContentPayload, EditorStatus, SchemaDefinition, SectionDefinition } from './types';

type EditorState = {
  readonly loading: boolean;
  readonly saving: boolean;
  readonly dirty: boolean;
  readonly error: string | null;
  readonly status: EditorStatus | null;
  readonly schema: SchemaDefinition | null;
  readonly schemaMap: Map<string, SectionDefinition>;
  readonly content: ContentPayload | null;
  readonly selectedPage: number;
  readonly previewVisible: boolean;
  readonly previewDevice: 'desktop' | 'tablet' | 'mobile';
  readonly previewVersion: number;
  readonly selectedJournalPostId: string | null;
};

const initialState: EditorState = {
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
  selectedJournalPostId: null,
};

type LoadResponse = {
  readonly schema: SchemaDefinition;
  readonly content: ContentPayload;
};

const randomId = (): string => {
  const globalCrypto = globalThis?.crypto;
  if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
    return globalCrypto.randomUUID();
  }
  return `post-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
};

const createJournalPostTemplate = (): Record<string, unknown> => {
  const id = randomId();
  const slugSegment = id.slice(0, 8);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id,
    title: 'Untitled post',
    slug: `/journal/${slugSegment}`,
    excerpt: '',
    publishedAt: today,
    coverImage: { src: '', alt: '', focalPoint: 'center' },
    blocks: [
      {
        type: 'text',
        title: 'New block',
        body: '',
      },
    ],
  };
};

const getJournalPostsFromPage = (page: ContentPage | undefined): Record<string, unknown>[] => {
  const data = page?.data as Record<string, unknown> | undefined;
  const posts = data?.['journalPosts'];
  return Array.isArray(posts) ? (posts as Record<string, unknown>[]) : [];
};

const getFirstJournalPostId = (page: ContentPage | undefined): string | null => {
  const posts = getJournalPostsFromPage(page);
  const firstId = posts[0]?.['id'];
  return typeof firstId === 'string' ? firstId : null;
};

const ensureJournalPostsArray = (page: ContentPage): Record<string, unknown>[] => {
  const data = page.data as Record<string, unknown>;
  if (!Array.isArray(data['journalPosts'])) {
    data['journalPosts'] = [];
  }
  return data['journalPosts'] as Record<string, unknown>[];
};

const linkPostToBlogRoll = (page: ContentPage, postId: string): void => {
  const data = page.data as Record<string, unknown>;
  const sections = data['sections'];
  if (!Array.isArray(sections)) {
    return;
  }
  const blogRoll = (sections as Record<string, unknown>[]).find((section) => section?.['type'] === 'blog-roll');
  if (!blogRoll) {
    return;
  }
  if (!Array.isArray(blogRoll['posts'])) {
    blogRoll['posts'] = [];
  }
  const references = blogRoll['posts'] as Array<Record<string, unknown>>;
  if (references.some((entry) => entry?.['postId'] === postId)) {
    return;
  }
  references.unshift({ postId });
};

type ListOperation =
  | { readonly type: 'add'; readonly path: string; readonly template: Record<string, unknown> }
  | { readonly type: 'remove'; readonly path: string; readonly index: number }
  | { readonly type: 'move'; readonly path: string; readonly index: number; readonly direction: number };

const waitForRebuild = (previewBase: string): Promise<void> =>
  new Promise((resolve) => {
    const base = previewBase.replace(/\/$/, '');
    let settled = false;
    const cleanup = (source: EventSource | null, timer: ReturnType<typeof setTimeout>) => {
      if (settled) return;
      settled = true;
      if (source) {
        source.close();
      }
      clearTimeout(timer);
      resolve();
    };
    try {
      const source = new EventSource(`${base}/__ual/live`);
      const timer = setTimeout(() => cleanup(source, timer), 5000);
      source.addEventListener('message', (event) => {
        if (event.data === 'reload') {
          cleanup(source, timer);
        }
      });
      source.addEventListener('error', () => {
        cleanup(source, timer);
      });
    } catch {
      setTimeout(() => resolve(), 500);
    }
  });

export const useContentStudio = (config: AdminRuntimeConfig) => {
  const [state, setState] = useState<EditorState>(initialState);

  const previewCandidates = useMemo(() => getPreviewCandidates(), []);

  const applyStatus = useCallback((status: EditorStatus | null) => {
    setState((prev) => ({ ...prev, status }));
  }, []);

  const loadContent = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const response = await fetch(`${config.apiBaseUrl}/content`);
      if (!response.ok) {
        throw new Error(`Content API error (${response.status})`);
      }
      const payload = (await response.json()) as LoadResponse;
      setState({
        ...initialState,
        loading: false,
        schema: payload.schema,
        schemaMap: buildSchemaMap(payload.schema),
        content: payload.content,
        previewVersion: Date.now(),
        status: { message: 'Loaded content schema', variant: 'success' },
        selectedJournalPostId: getFirstJournalPostId(payload.content.pages[0]),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load content';
      setState((prev) => ({ ...prev, loading: false, error: message, status: { message, variant: 'error' } }));
    }
  }, [config.apiBaseUrl]);

  useEffect(() => {
    void loadContent();
  }, [loadContent]);

  const updateContent = useCallback((mutator: (draft: ContentPayload) => void) => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      mutator(nextContent);
      return { ...prev, content: nextContent, dirty: true };
    });
  }, []);

  const updateField = useCallback(
    (path: string, value: unknown) => {
      updateContent((draft) => {
        setByPath(draft as unknown as Record<string, unknown>, path, value);
      });
    },
    [updateContent],
  );

  const modifyList = useCallback(
    (operation: ListOperation) => {
      updateContent((draft) => {
        const list = getByPath(draft, operation.path);
        if (!Array.isArray(list)) {
          setByPath(draft as unknown as Record<string, unknown>, operation.path, []);
        }
        const target = getByPath(draft, operation.path);
        if (!Array.isArray(target)) return;
        if (operation.type === 'add') {
          target.unshift(clone(operation.template)); // Add to top instead of push
          return;
        }
        if (operation.type === 'remove') {
          target.splice(operation.index, 1);
          return;
        }
        if (operation.type === 'move') {
          const nextIndex = operation.index + operation.direction;
          if (nextIndex < 0 || nextIndex >= target.length) return;
          const [item] = target.splice(operation.index, 1);
          target.splice(nextIndex, 0, item);
        }
      });
    },
    [updateContent],
  );

  const toggleGroup = useCallback(
    (path: string, template: Record<string, unknown>) => {
      updateContent((draft) => {
        const current = getByPath(draft, path);
        if (current == null) {
          setByPath(draft as unknown as Record<string, unknown>, path, clone(template));
        } else {
          deleteByPath(draft as unknown as Record<string, unknown>, path);
        }
      });
    },
    [updateContent],
  );

  const selectPage = useCallback((index: number) => {
    setState((prev) => {
      const page = prev.content?.pages[index];
      return {
        ...prev,
        selectedPage: index,
        selectedJournalPostId: getFirstJournalPostId(page),
      };
    });
  }, []);

  const addPage = useCallback(() => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      const defaults = state.schema?.page?.defaults ?? { sections: [] };
      nextContent.pages.push({ data: clone(defaults) });
      const newPageIndex = nextContent.pages.length - 1;
      const newPage = nextContent.pages[newPageIndex];
      return {
        ...prev,
        content: nextContent,
        dirty: true,
        selectedPage: newPageIndex,
        selectedJournalPostId: getFirstJournalPostId(newPage),
      };
    });
  }, [state.schema]);

  const deletePage = useCallback(() => {
    setState((prev) => {
      if (!prev.content || prev.content.pages.length <= 1) {
        return prev;
      }
      const nextContent = clone(prev.content);
      nextContent.pages.splice(prev.selectedPage, 1);
      const nextIndex = Math.max(0, Math.min(prev.selectedPage, nextContent.pages.length - 1));
      return {
        ...prev,
        content: nextContent,
        dirty: true,
        selectedPage: nextIndex,
        selectedJournalPostId: getFirstJournalPostId(nextContent.pages[nextIndex]),
      };
    });
  }, []);

  const addSection = useCallback((sectionType: string) => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      const page = nextContent.pages[prev.selectedPage];
      if (!page) return prev;
      if (!Array.isArray(page.data.sections)) {
        page.data.sections = [];
      }
      const template = buildSectionTemplate(sectionType, prev.schemaMap);
      (page.data.sections as Record<string, unknown>[]).push(template);
      return { ...prev, content: nextContent, dirty: true };
    });
  }, []);

  const removeSection = useCallback((index: number) => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      const page = nextContent.pages[prev.selectedPage];
      if (!page?.data?.sections || !Array.isArray(page.data.sections)) return prev;
      (page.data.sections as unknown[]).splice(index, 1);
      return { ...prev, content: nextContent, dirty: true };
    });
  }, []);

  const moveSection = useCallback((index: number, direction: number) => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      const page = nextContent.pages[prev.selectedPage];
      if (!page?.data?.sections || !Array.isArray(page.data.sections)) return prev;
      const sections = page.data.sections as unknown[];
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= sections.length) return prev;
      const [item] = sections.splice(index, 1);
      sections.splice(nextIndex, 0, item);
      return { ...prev, content: nextContent, dirty: true };
    });
  }, []);

  const selectJournalPost = useCallback((postId: string | null) => {
    setState((prev) => ({ ...prev, selectedJournalPostId: postId }));
  }, []);

  const addJournalPost = useCallback(() => {
    setState((prev) => {
      if (!prev.content) return prev;
      const nextContent = clone(prev.content);
      const page = nextContent.pages[prev.selectedPage];
      if (!page) return prev;
      const posts = ensureJournalPostsArray(page);
      const template = createJournalPostTemplate();
      posts.unshift(template);
      const newId = String(template.id);
      linkPostToBlogRoll(page, newId);
      return {
        ...prev,
        content: nextContent,
        dirty: true,
        selectedJournalPostId: newId,
      };
    });
  }, []);

  const togglePreview = useCallback(() => {
    setState((prev) => ({ ...prev, previewVisible: !prev.previewVisible }));
  }, []);

  const setPreviewDevice = useCallback((device: 'desktop' | 'tablet' | 'mobile') => {
    setState((prev) => ({ ...prev, previewDevice: device }));
  }, []);

  const bumpPreviewVersion = useCallback(() => {
    setState((prev) => ({ ...prev, previewVersion: Date.now() }));
  }, []);

  const saveContent = useCallback(async () => {
    if (!state.content || state.saving) return;
    setState((prev) => ({ ...prev, saving: true, status: { message: 'Saving content…', variant: 'muted' } }));
    try {
      const response = await fetch(`${config.apiBaseUrl}/content`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(state.content, null, 2),
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(text || 'Failed to save content');
      }
      await waitForRebuild(config.previewBaseUrl);
      bumpPreviewVersion();
      setState((prev) => ({
        ...prev,
        saving: false,
        dirty: false,
        status: { message: 'Preview updated', variant: 'success' },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save content';
      setState((prev) => ({
        ...prev,
        saving: false,
        status: { message, variant: 'error' },
      }));
    }
  }, [bumpPreviewVersion, config.apiBaseUrl, config.previewBaseUrl, state.content, state.saving]);

  const previewPaths = useMemo(() => {
    if (!state.content) return previewCandidates;
    const paths = state.content.pages.flatMap((page) => {
      const pageSlug = String(page.data.slug ?? '/');
      const normalized = pageSlug.startsWith('/') ? pageSlug : `/${pageSlug}`;
      const postSlugs = Array.isArray(page.data.journalPosts)
        ? (page.data.journalPosts as Record<string, unknown>[])
            .map((post) => {
              const slug = typeof post.slug === 'string' ? post.slug : '';
              if (!slug) return null;
              return slug.startsWith('/') ? slug : `/${slug}`;
            })
            .filter((slug): slug is string => Boolean(slug))
        : [];
      return [normalized, ...postSlugs];
    });
    if (!paths.includes('/')) {
      paths.unshift('/');
    }
    return Array.from(new Set(paths));
  }, [previewCandidates, state.content]);

  return {
    state,
    applyStatus,
    updateField,
    modifyList,
    toggleGroup,
    selectPage,
    addPage,
    deletePage,
    addSection,
    removeSection,
    moveSection,
    selectJournalPost,
    addJournalPost,
    togglePreview,
    setPreviewDevice,
    bumpPreviewVersion,
    saveContent,
    reloadContent: loadContent,
    previewPaths,
  };
};

