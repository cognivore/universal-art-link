import { useState, useRef, useCallback } from 'react';
import {
  Upload,
  Image as ImageIcon,
  FolderOpen,
  X,
  Loader2,
  RefreshCw,
  Check,
} from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Label } from '../../components/ui/label';
import { Gallery } from './Gallery';
import { getAssetUrl, uploadAsset } from '../../lib/gallery-api';

type GalleryPickerProps = {
  /** Current image URL value */
  value: string;
  /** Called when an image is selected or uploaded */
  onChange: (url: string) => void;
  /** Label for the field */
  label?: string;
  /** Optional placeholder text */
  placeholder?: string;
};

type PickerMode = 'closed' | 'upload' | 'gallery';

/**
 * GalleryPicker component for selecting images.
 *
 * Combines:
 * - Direct upload functionality
 * - Gallery browser for selecting existing assets
 * - Preview of selected image
 *
 * This replaces or enhances the ImageUpload component when gallery
 * selection is desired.
 */
export const GalleryPicker = ({
  value,
  onChange,
  label = 'Image',
  placeholder,
}: GalleryPickerProps) => {
  const [mode, setMode] = useState<PickerMode>('closed');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      setUploading(true);
      setError(null);

      try {
        const result = await uploadAsset(file);
        onChange(result.url);
        setMode('closed');
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [onChange]
  );

  const handleGallerySelect = useCallback(
    (url: string) => {
      onChange(url);
      setMode('closed');
    },
    [onChange]
  );

  const handleClear = () => {
    onChange('');
    setError(null);
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const isExternalUrl = value.startsWith('http://') || value.startsWith('https://');
  const hasImage = Boolean(value);
  const imageUrl = hasImage ? (isExternalUrl ? value : getAssetUrl(value)) : null;

  return (
    <div className="space-y-3">
      <Label>{label}</Label>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Current image preview */}
      {hasImage && imageUrl && (
        <div className="flex items-start gap-3">
          <div className="relative">
            <img
              src={imageUrl}
              alt="Selected"
              className="h-24 w-24 rounded-lg border object-cover bg-slate-50"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {isExternalUrl && (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-medium uppercase tracking-wide text-white">
                External
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setMode('gallery')}
              className="h-8"
            >
              <RefreshCw className="mr-2 h-3 w-3" />
              Change
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-8 text-destructive hover:text-destructive"
            >
              <X className="mr-2 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      )}

      {/* Selection buttons when no image */}
      {!hasImage && mode === 'closed' && (
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={triggerUpload}
            disabled={uploading}
            className="flex-1"
          >
            {uploading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Uploading...
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                Upload New
              </>
            )}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => setMode('gallery')}
            className="flex-1"
          >
            <FolderOpen className="mr-2 h-4 w-4" />
            From Gallery
          </Button>
        </div>
      )}

      {/* Gallery browser panel */}
      {mode === 'gallery' && (
        <div className="rounded-xl border bg-slate-50/50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h4 className="font-medium text-slate-700">Select from Gallery</h4>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setMode('closed')}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <Gallery
            pickerMode
            onSelect={handleGallerySelect}
            selectedUrl={value}
          />
        </div>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Help text */}
      {!hasImage && mode === 'closed' && (
        <p className="text-xs text-muted-foreground">
          {placeholder ?? 'Upload a new image or select from your gallery (max 5MB).'}
        </p>
      )}
    </div>
  );
};

