import { useRef, useCallback } from 'react';
import {
  Upload,
  Grid,
  List,
  Search,
  RefreshCw,
  Loader2,
  ImageIcon,
  FileImage,
  Check,
  X,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../../components/ui/card';
import { ScrollArea } from '../../components/ui/scroll-area';
import { useGallery } from './useGallery';
import { getAssetUrl, formatFileSize, type Asset } from '../../lib/gallery-api';

type GalleryProps = {
  /** Called when an asset is selected (for picker mode) */
  onSelect?: (url: string) => void;
  /** Whether we're in picker mode (inline selection) */
  pickerMode?: boolean;
  /** Currently selected URL (for highlighting in picker mode) */
  selectedUrl?: string;
  /** Optional className for the container */
  className?: string;
};

/**
 * Gallery component for viewing and managing assets.
 *
 * Can be used:
 * 1. As a standalone tab in the admin panel
 * 2. As an inline picker when selecting images for content
 */
export const Gallery = ({
  onSelect,
  pickerMode = false,
  selectedUrl,
  className = '',
}: GalleryProps) => {
  const {
    filteredAssets,
    loading,
    uploading,
    error,
    selectedAsset,
    searchQuery,
    viewMode,
    actions,
  } = useGallery();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const asset = await actions.upload(file);

      // In picker mode, auto-select the uploaded asset
      if (asset && onSelect) {
        onSelect(asset.url);
      }

      // Clear the file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [actions, onSelect]
  );

  const handleAssetClick = useCallback(
    (asset: Asset) => {
      actions.select(asset);
      if (onSelect) {
        onSelect(asset.url);
      }
    },
    [actions, onSelect]
  );

  const isSelected = (asset: Asset) => {
    if (selectedUrl) {
      return asset.url === selectedUrl || getAssetUrl(asset.url) === selectedUrl;
    }
    return selectedAsset?.url === asset.url;
  };

  const containerClass = pickerMode
    ? `${className}`
    : `space-y-4 ${className}`;

  return (
    <div className={containerClass}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Header with controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search assets..."
            value={searchQuery}
            onChange={(e) => actions.setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* View toggle */}
        <div className="flex rounded-lg border p-1">
          <Button
            variant={viewMode === 'grid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => actions.setViewMode('grid')}
            className="h-8 px-2"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button
            variant={viewMode === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => actions.setViewMode('list')}
            className="h-8 px-2"
          >
            <List className="h-4 w-4" />
          </Button>
        </div>

        {/* Refresh */}
        <Button
          variant="outline"
          size="sm"
          onClick={actions.refresh}
          disabled={loading}
          className="h-9"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>

        {/* Upload */}
        <Button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-9"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center justify-between rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          <span>{error}</span>
          <Button variant="ghost" size="sm" onClick={actions.clearError}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && filteredAssets.length === 0 && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {/* Empty state */}
      {!loading && filteredAssets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageIcon className="mb-4 h-12 w-12 text-muted-foreground/50" />
          <h3 className="text-lg font-medium text-muted-foreground">
            {searchQuery ? 'No matching assets' : 'No assets yet'}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground/70">
            {searchQuery
              ? 'Try a different search term'
              : 'Upload your first image to get started'}
          </p>
          {!searchQuery && (
            <Button
              className="mt-4"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Image
            </Button>
          )}
        </div>
      )}

      {/* Assets grid/list */}
      {filteredAssets.length > 0 && (
        <ScrollArea className={pickerMode ? 'h-[300px]' : 'h-[500px]'}>
          {viewMode === 'grid' ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
              {filteredAssets.map((asset) => (
                <AssetGridItem
                  key={asset.url}
                  asset={asset}
                  selected={isSelected(asset)}
                  onClick={() => handleAssetClick(asset)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredAssets.map((asset) => (
                <AssetListItem
                  key={asset.url}
                  asset={asset}
                  selected={isSelected(asset)}
                  onClick={() => handleAssetClick(asset)}
                />
              ))}
            </div>
          )}
        </ScrollArea>
      )}
    </div>
  );
};

type AssetItemProps = {
  asset: Asset;
  selected: boolean;
  onClick: () => void;
};

const AssetGridItem = ({ asset, selected, onClick }: AssetItemProps) => {
  const isSvg = asset.type === 'image/svg+xml';

  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative aspect-square overflow-hidden rounded-xl border-2 transition-all hover:shadow-md ${
        selected
          ? 'border-violet-500 ring-2 ring-violet-500/30'
          : 'border-transparent hover:border-slate-200'
      }`}
    >
      <img
        src={getAssetUrl(asset.url)}
        alt={asset.filename}
        className={`h-full w-full object-cover ${isSvg ? 'bg-slate-50 p-2' : ''}`}
        loading="lazy"
      />

      {/* Selection indicator */}
      {selected && (
        <div className="absolute right-2 top-2 rounded-full bg-violet-500 p-1 text-white">
          <Check className="h-3 w-3" />
        </div>
      )}

      {/* Filename overlay on hover */}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
        <p className="truncate text-xs text-white">{asset.filename}</p>
      </div>
    </button>
  );
};

const AssetListItem = ({ asset, selected, onClick }: AssetItemProps) => {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-xl border-2 p-3 text-left transition-all hover:shadow-sm ${
        selected
          ? 'border-violet-500 bg-violet-50 ring-2 ring-violet-500/30'
          : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
      }`}
    >
      <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg bg-slate-100">
        <img
          src={getAssetUrl(asset.url)}
          alt={asset.filename}
          className="h-full w-full object-cover"
          loading="lazy"
        />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-slate-900">{asset.filename}</p>
        <p className="text-sm text-muted-foreground">
          {formatFileSize(asset.size)} • {new Date(asset.modifiedAt).toLocaleDateString()}
        </p>
      </div>
      {selected && (
        <div className="rounded-full bg-violet-500 p-1 text-white">
          <Check className="h-4 w-4" />
        </div>
      )}
    </button>
  );
};

/**
 * Standalone Gallery page component for the admin panel tab
 */
export const GalleryPage = () => {
  return (
    <Card className="bg-white/90">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileImage className="h-5 w-5" />
          Asset Gallery
        </CardTitle>
        <CardDescription>
          Manage images and media files for your site. Upload new assets or select existing ones.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Gallery />
      </CardContent>
    </Card>
  );
};

