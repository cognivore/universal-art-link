export type AdminRuntimeConfig = {
  previewBaseUrl: string;
  previewHealthPath: string;
  apiBaseUrl: string;
  strapiUrl: string;
};

declare global {
  interface Window {
    __UAL_RUNTIME__?: Partial<AdminRuntimeConfig> & {
      previewPaths?: string[];
    };
  }
}

const defaultConfig: AdminRuntimeConfig = {
  previewBaseUrl: window.location.origin,
  previewHealthPath: '/__ual/healthz',
  apiBaseUrl: '/__ual/api',
  strapiUrl: 'http://localhost:1337'
};

export const getRuntimeConfig = (): AdminRuntimeConfig => {
  return {
    ...defaultConfig,
    ...window.__UAL_RUNTIME__
  };
};

export const getPreviewCandidates = (): string[] => {
  const fromRuntime = window.__UAL_RUNTIME__?.previewPaths ?? [];
  return fromRuntime.length ? fromRuntime : ['/', '/work', '/journal'];
};

