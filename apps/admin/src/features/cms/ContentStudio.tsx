import { useMemo, useState } from 'react';
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

export const ContentStudio = () => {
  const runtimeConfig = useMemo(() => getRuntimeConfig(), []);
  const studio = useContentStudio(runtimeConfig);
  const [navView, setNavView] = useState<StudioNavView>('content');
  const [pageTab, setPageTab] = useState<'details' | 'sections'>('details');

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
          <ResizablePanel defaultSize={55} minSize={40}>
            <div className="flex flex-col gap-6" data-testid="cms-layout">
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
                    onDeletePage={studio.deletePage}
                  />
                  <Card data-testid="page-panel">
                    <CardHeader className="pb-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <CardDescription className="uppercase tracking-[0.3em] text-xs">Page</CardDescription>
                          <CardTitle>{pageTitle}</CardTitle>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" onClick={() => studio.deletePage()} disabled={studio.state.content.pages.length <= 1}>
                            Delete page
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <Tabs value={pageTab} onValueChange={(value) => setPageTab(value as 'details' | 'sections')}>
                        <TabsList>
                          <TabsTrigger value="details">Page details</TabsTrigger>
                          <TabsTrigger value="sections">Sections</TabsTrigger>
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
                            onRemoveSection={studio.removeSection}
                            onMoveSection={studio.moveSection}
                          />
                        </TabsContent>
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
              <ResizablePanel defaultSize={45} minSize={35}>
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
    </div>
  );
};


