import { useState, useCallback, useEffect } from 'react';
import { fetchAssets, uploadAsset, type Asset } from '../../lib/gallery-api';

export type GalleryState = {
  assets: Asset[];
  loading: boolean;
  uploading: boolean;
  error: string | null;
  selectedAsset: Asset | null;
  searchQuery: string;
  viewMode: 'grid' | 'list';
};

export type GalleryActions = {
  refresh: () => Promise<void>;
  upload: (file: File) => Promise<Asset | null>;
  select: (asset: Asset | null) => void;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: 'grid' | 'list') => void;
  clearError: () => void;
};

export const useGallery = () => {
  const [state, setState] = useState<GalleryState>({
    assets: [],
    loading: true,
    uploading: false,
    error: null,
    selectedAsset: null,
    searchQuery: '',
    viewMode: 'grid',
  });

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const assets = await fetchAssets();
      setState((prev) => ({ ...prev, assets, loading: false }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load assets';
      setState((prev) => ({ ...prev, error: message, loading: false }));
    }
  }, []);

  const upload = useCallback(async (file: File): Promise<Asset | null> => {
    setState((prev) => ({ ...prev, uploading: true, error: null }));
    try {
      const result = await uploadAsset(file);
      // Create asset object from upload result
      const newAsset: Asset = {
        filename: result.filename,
        url: result.url,
        type: file.type,
        size: file.size,
        modifiedAt: new Date().toISOString(),
      };
      // Add to beginning of assets list
      setState((prev) => ({
        ...prev,
        assets: [newAsset, ...prev.assets],
        uploading: false,
        selectedAsset: newAsset,
      }));
      return newAsset;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Upload failed';
      setState((prev) => ({ ...prev, error: message, uploading: false }));
      return null;
    }
  }, []);

  const select = useCallback((asset: Asset | null) => {
    setState((prev) => ({ ...prev, selectedAsset: asset }));
  }, []);

  const setSearchQuery = useCallback((query: string) => {
    setState((prev) => ({ ...prev, searchQuery: query }));
  }, []);

  const setViewMode = useCallback((mode: 'grid' | 'list') => {
    setState((prev) => ({ ...prev, viewMode: mode }));
  }, []);

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  // Load assets on mount
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Filter assets by search query
  const filteredAssets = state.searchQuery
    ? state.assets.filter((asset) =>
        asset.filename.toLowerCase().includes(state.searchQuery.toLowerCase())
      )
    : state.assets;

  return {
    ...state,
    filteredAssets,
    actions: {
      refresh,
      upload,
      select,
      setSearchQuery,
      setViewMode,
      clearError,
    },
  };
};

