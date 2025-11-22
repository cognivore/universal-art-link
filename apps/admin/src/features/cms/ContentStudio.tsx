import { useEffect, useMemo, useState } from 'react';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../components/ui/resizable';
import { getRuntimeConfig } from '../../lib/runtime-config';
import { ContentEmptyState } from './ContentEmptyState';
import { PageSidebar } from './PageSidebar';
import { SchemaForm } from './SchemaForm';
import { SectionList } from './SectionList';
import { useContentStudio } from './useContentStudio';
import { PreviewPane } from '../preview/PreviewPane';
import { getByPath } from './helpers';
import { StudioNav, type StudioNavView } from './StudioNav';
import { useConfirm } from '../../hooks/useConfirm';
import { BlogPostEditor } from './BlogPostEditor';

export const ContentStudio = () => {
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const studio = useContentStudio(runtimeConfig);
  const { confirm, dialog } = useConfirm();
  const [navView, setNavView] = useState<StudioNavView>('content');
  const [pageTab, setPageTab] = useState<'details' | 'sections' | 'post'>('details');

  const handleDeletePage = async () => {
    const confirmed = await confirm({
      title: 'Delete this page?',
      description: 'This action cannot be undone. The page and all its sections will be permanently removed.',
      confirmLabel: 'Delete page',
      cancelLabel: 'Keep it',
    });
    if (confirmed) {
      studio.deletePage();
    }
  };

  const handleRemoveSection = async (index: number) => {
    const confirmed = await confirm({
      title: 'Remove this section?',
      description: 'This section will be permanently removed from the page.',
      confirmLabel: 'Remove section',
      cancelLabel: 'Cancel',
    });
    if (confirmed) {
      studio.removeSection(index);
    }
  };

  const handleConfirmRemoveItem = async (itemLabel: string): Promise<boolean> => {
    return confirm({
      title: `Remove this ${itemLabel.toLowerCase()}?`,
      description: 'This entry will be permanently removed.',
      confirmLabel: `Remove ${itemLabel.toLowerCase()}`,
      cancelLabel: 'Cancel',
    });
  };

  if (studio.state.loading) {
    return (
      <div className="flex min-h-[500px] items-center justify-center rounded-3xl border border-dashed">
        <p className="text-muted-foreground">Loading content schema…</p>
      </div>
    );
  }

  if (studio.state.error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="text-red-700">Failed to load content</CardTitle>
          <CardDescription className="text-red-600">{studio.state.error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => studio.reloadContent()}>
            Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!studio.state.content) {
    return <ContentEmptyState onRetry={() => studio.reloadContent()} />;
  }

  const selectedPage = studio.state.content.pages[studio.state.selectedPage];
  const getValue = (path: string) => getByPath(studio.state.content!, path);
  const pageTitle = String(selectedPage?.data?.title ?? 'Untitled page');
  const pageBasePath = `pages.${studio.state.selectedPage}.data`;
  const isJournalPage = selectedPage?.data?.layout === 'journal';
  const journalPosts = Array.isArray(selectedPage?.data?.journalPosts) ? (selectedPage.data.journalPosts as Record<string, unknown>[]) : [];
  const selectedJournalPostId = studio.state.selectedJournalPostId;
  const selectedPostIndex =
    selectedJournalPostId && journalPosts.length
      ? journalPosts.findIndex((post) => String(post.id) === selectedJournalPostId)
      : -1;
  const selectedPost = selectedPostIndex >= 0 ? (journalPosts[selectedPostIndex] as Record<string, unknown>) : null;
  const postBasePath = selectedPostIndex >= 0 ? `${pageBasePath}.journalPosts.${selectedPostIndex}` : null;

  // Auto-switch away from 'post' tab when navigating to non-journal pages
  const effectivePageTab = !isJournalPage && pageTab === 'post' ? 'details' : pageTab;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="uppercase tracking-[0.35em] text-xs text-muted-foreground">Content Studio</p>
          <h1 className="text-3xl font-semibold">Editorial CMS</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" data-testid="toggle-preview" onClick={() => studio.togglePreview()}>
            {studio.state.previewVisible ? 'Hide preview' : 'Show preview'}
          </Button>
          <Button variant="outline" data-testid="refresh-button" onClick={() => studio.reloadContent()} disabled={studio.state.loading}>
            Refresh
          </Button>
          <Button data-testid="save-button" onClick={() => studio.saveContent()} disabled={studio.state.saving || !studio.state.dirty}>
            {studio.state.saving ? 'Saving…' : studio.state.dirty ? 'Save changes' : 'In sync'}
          </Button>
        </div>
      </header>
      {studio.state.status ? (
        <div
          className={`rounded-2xl border px-4 py-2 text-sm ${
            studio.state.status.variant === 'success'
              ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
              : studio.state.status.variant === 'error'
                ? 'border-red-200 bg-red-50 text-red-700'
                : 'border-muted bg-muted/40 text-muted-foreground'
          }`}
        >
          {studio.state.status.message}
        </div>
      ) : null}
      <div className="lg:hidden">
        <Tabs value={navView} onValueChange={(value) => setNavView(value as StudioNavView)}>
          <TabsList className="w-full justify-start">
            <TabsTrigger value="content">Content</TabsTrigger>
            <TabsTrigger value="site">Site</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="flex flex-col gap-6 xl:flex-row">
        <StudioNav value={navView} onChange={setNavView} />
        <ResizablePanelGroup direction="horizontal" className="flex-1 gap-4">
          <ResizablePanel defaultSize={55} minSize={40} className="overflow-auto">
            <div className="flex flex-col gap-6 pb-20" data-testid="cms-layout">
              {navView === 'site' && studio.state.schema?.site ? (
                <Card data-testid="site-panel" className="max-w-3xl">
                  <CardHeader className="pb-4">
                    <CardDescription className="uppercase tracking-[0.3em] text-xs">Site</CardDescription>
                    <CardTitle>{studio.state.schema.site.title ?? 'Site settings'}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <SchemaForm
                      basePath="site"
                      fields={studio.state.schema.site.fields}
                      lists={studio.state.schema.site.lists}
                      groups={studio.state.schema.site.groups}
                      getValue={getValue}
                      onFieldChange={studio.updateField}
                      onListChange={studio.modifyList}
                      onToggleGroup={studio.toggleGroup}
                      onConfirmRemove={handleConfirmRemoveItem}
                    />
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 2xl:grid-cols-[280px_1fr]">
                  <PageSidebar
                    pages={studio.state.content.pages}
                    selectedIndex={studio.state.selectedPage}
                    onSelect={studio.selectPage}
                    onAddPage={studio.addPage}
                    onDeletePage={handleDeletePage}
                  />
                  <Card data-testid="page-panel">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardDescription className="uppercase tracking-[0.3em] text-xs">Page</CardDescription>
                          <CardTitle>{pageTitle}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                      {isJournalPage ? (
                        <Button size="sm" onClick={() => studio.addJournalPost()} data-testid="add-post-button">
                          New post
                        </Button>
                      ) : null}
                          <Button variant="outline" size="sm" onClick={handleDeletePage} disabled={studio.state.content.pages.length <= 1}>
                            Delete page
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Tabs value={effectivePageTab} onValueChange={(value) => setPageTab(value as 'details' | 'sections' | 'post')}>
                        <TabsList>
                          <TabsTrigger value="details">Page details</TabsTrigger>
                          <TabsTrigger value="sections">Sections</TabsTrigger>
                          {isJournalPage ? <TabsTrigger value="post">Edit post</TabsTrigger> : null}
                        </TabsList>
                        <TabsContent value="details" className="space-y-4">
                          <SchemaForm
                            basePath={pageBasePath}
                            fields={studio.state.schema?.page?.fields}
                            lists={studio.state.schema?.page?.lists}
                            groups={studio.state.schema?.page?.groups}
                            getValue={getValue}
                            onFieldChange={studio.updateField}
                            onListChange={studio.modifyList}
                            onToggleGroup={studio.toggleGroup}
                            onConfirmRemove={handleConfirmRemoveItem}
                          />
                        </TabsContent>
                        <TabsContent value="sections">
                          <SectionList
                            page={selectedPage}
                            schema={studio.state.schema}
                            schemaMap={studio.state.schemaMap}
                            pageIndex={studio.state.selectedPage}
                            getValue={getValue}
                            onFieldChange={studio.updateField}
                            onListChange={studio.modifyList}
                            onToggleGroup={studio.toggleGroup}
                            onAddSection={studio.addSection}
                            onRemoveSection={handleRemoveSection}
                            onMoveSection={studio.moveSection}
                            onConfirmRemove={handleConfirmRemoveItem}
                            selectedJournalPostId={selectedJournalPostId}
                            onSelectJournalPost={(postId) => studio.selectJournalPost(postId)}
                          />
                        </TabsContent>
                        {isJournalPage ? (
                          <TabsContent value="post">
                            <BlogPostEditor
                              basePath={postBasePath}
                              post={selectedPost}
                              getValue={getValue}
                              onFieldChange={studio.updateField}
                              onListChange={studio.modifyList}
                              onToggleGroup={studio.toggleGroup}
                              onCreatePost={studio.addJournalPost}
                            />
                          </TabsContent>
                        ) : null}
                      </Tabs>
                    </CardContent>
                  </Card>
                </div>
              )}
            </div>
          </ResizablePanel>
          {studio.state.previewVisible ? (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={45} minSize={35} className="sticky top-0 h-screen overflow-hidden">
                <PreviewPane
                  config={runtimeConfig}
                  paths={studio.previewPaths}
                  version={studio.state.previewVersion}
                  selectedPath={selectedPage?.data?.slug ? String(selectedPage.data.slug) : '/'}
                />
              </ResizablePanel>
            </>
          ) : null}
        </ResizablePanelGroup>
      </div>
      {dialog}
    </div>
  );
};


