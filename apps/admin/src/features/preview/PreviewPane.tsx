import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Button } from '../../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '../../components/ui/resizable';
import { cn } from '../../lib/utils';
import type { AdminRuntimeConfig } from '../../lib/runtime-config';

export type PreviewPaneProps = {
  readonly config: AdminRuntimeConfig;
  readonly paths: string[];
  readonly version?: number;
  readonly selectedPath?: string;
};

type Device = 'desktop' | 'tablet' | 'mobile';

export const PreviewPane = ({ config, paths, version, selectedPath: initialPath }: PreviewPaneProps) => {
  const [device, setDevice] = useState<Device>('desktop');
  const [selectedPath, setSelectedPath] = useState(initialPath ?? paths[0] ?? '/');
  const [status, setStatus] = useState<'checking' | 'ready' | 'error'>('checking');
  const [reloadKey, setReloadKey] = useState(() => Date.now());

  const previewUrl = useMemo(() => {
    const base = config.previewBaseUrl.replace(/\/$/, '');
    return `${base}${selectedPath.startsWith('/') ? '' : '/'}${selectedPath}`;
  }, [config.previewBaseUrl, selectedPath]);

  const healthUrl = useMemo(() => {
    const base = config.previewBaseUrl.replace(/\/$/, '');
    const path = config.previewHealthPath.startsWith('/') ? config.previewHealthPath : `/${config.previewHealthPath}`;
    return `${base}${path}`;
  }, [config.previewBaseUrl, config.previewHealthPath]);

  const checkHealth = useCallback(async () => {
    setStatus('checking');
    try {
      const response = await fetch(healthUrl, { method: 'GET', mode: 'cors' });
      if (!response.ok) {
        throw new Error('Preview healthcheck failed');
      }
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, [healthUrl]);

  const reloadFrame = useCallback(() => {
    setReloadKey(Date.now());
    void checkHealth();
  }, [checkHealth]);

  useEffect(() => {
    if (initialPath && initialPath !== selectedPath) {
      setSelectedPath(initialPath);
    }
  }, [initialPath, selectedPath]);

  useEffect(() => {
    if (version) {
      setReloadKey(Date.now());
      void checkHealth();
    }
  }, [checkHealth, version]);

  useEffect(() => {
    void checkHealth();
  }, [checkHealth]);

  const deviceClass = useMemo(() => {
    if (device === 'tablet') return 'max-w-[768px]';
    if (device === 'mobile') return 'max-w-[428px]';
    return 'w-full';
  }, [device]);

  return (
    <Card className="h-full">
      <CardHeader className="flex flex-row items-center justify-between gap-4">
        <div>
          <CardTitle className="text-2xl">Live preview</CardTitle>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{previewUrl}</span>
            <Badge variant={status === 'ready' ? 'success' : status === 'error' ? 'error' : 'outline'}>
              {status === 'checking' ? 'Checking' : status === 'ready' ? 'Healthy' : 'Offline'}
            </Badge>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={reloadFrame}>
            Reload
          </Button>
          <Button variant="ghost" onClick={() => window.open(previewUrl, '_blank')}>
            Pop out
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex h-[680px] flex-col gap-4">
        <Tabs value={device} onValueChange={(value) => setDevice(value as Device)}>
          <TabsList>
            <TabsTrigger value="desktop">Desktop</TabsTrigger>
            <TabsTrigger value="tablet">Tablet</TabsTrigger>
            <TabsTrigger value="mobile">Mobile</TabsTrigger>
          </TabsList>
          <TabsContent value={device}>
            <div className="flex items-center justify-between gap-3">
              <select
                data-testid="preview-path-select"
                className="flex-1 rounded-2xl border border-input bg-transparent px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={selectedPath}
                onChange={(event) => setSelectedPath(event.target.value)}
              >
                {paths.map((path) => (
                  <option key={path} value={path}>
                    {path}
                  </option>
                ))}
              </select>
              <Button variant="outline" onClick={checkHealth}>
                Refresh status
              </Button>
            </div>
          </TabsContent>
        </Tabs>
        <div className="flex-1 rounded-[32px] border border-muted bg-muted/40 p-4">
          {status === 'error' ? (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <p className="text-lg font-semibold">Preview offline</p>
              <p className="text-sm">Ensure `universal-art-link dev -p 3322` is running so we can embed it here.</p>
            </div>
          ) : (
            <ResizablePanelGroup direction="horizontal">
              <ResizablePanel defaultSize={100}>
                <div className="flex h-full items-center justify-center">
                  <div className={cn('flex h-full flex-col overflow-hidden rounded-[28px] border bg-white shadow-2xl', deviceClass)}>
                    <iframe
                      key={reloadKey}
                      src={previewUrl}
                      title="UAL Preview"
                      className={cn('h-full w-full border-0', device === 'mobile' && 'h-[700px]')}
                      sandbox="allow-same-origin allow-scripts allow-forms"
                      onLoad={() => setStatus('ready')}
                    />
                  </div>
                </div>
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={0} minSize={0}>
                <div className="hidden h-full items-center justify-center text-sm text-muted-foreground lg:flex">
                  Coming soon: schema-driven diff + rebuild feed.
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

