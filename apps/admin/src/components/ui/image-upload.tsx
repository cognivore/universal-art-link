import { useState, useRef, useCallback, useMemo } from 'react';
import { Upload, X, Loader2, RefreshCw } from 'lucide-react';
import { Button } from './button';
import { Label } from './label';
import { getRuntimeConfig } from '../../lib/runtime-config';

type ImageUploadProps = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
};

const getApiBase = () => {
  const config = getRuntimeConfig();
  return config.previewBaseUrl;
};

export const ImageUpload = ({
  value,
  onChange,
  label = 'Image',
}: ImageUploadProps) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml'];
      if (!allowedTypes.includes(file.type)) {
        setError('Invalid file type. Allowed: jpeg, png, gif, webp, svg');
        return;
      }

      // Validate file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        setError('File too large. Maximum size is 5MB');
        return;
      }

      setUploading(true);
      setError(null);

      try {
        // Convert to base64
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            // Remove data URL prefix (e.g., "data:image/png;base64,")
            const base64 = result.split(',')[1];
            resolve(base64 ?? '');
          };
          reader.onerror = () => reject(new Error('Failed to read file'));
        });
        reader.readAsDataURL(file);
        const data = await base64Promise;

        // Upload to server
        const response = await fetch(`${getApiBase()}/__ual/api/assets/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            filename: file.name,
            data,
            mimeType: file.type,
          }),
        });

        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.error || 'Upload failed');
        }

        const result = await response.json();
        onChange(result.url);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        // Clear the file input
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    },
    [onChange],
  );

  const handleClear = () => {
    onChange('');
    setError(null);
  };

  const triggerUpload = () => fileInputRef.current?.click();

  const isExternalUrl = value.startsWith('http://') || value.startsWith('https://');
  const hasImage = Boolean(value);
  
  // Generate a cache-busting key based on the URL to force image reload on change
  const imageSrc = useMemo(() => {
    if (!value) return '';
    if (isExternalUrl) return value;
    // Add timestamp from filename (if present) or use URL as-is
    const base = `${getApiBase()}${value}`;
    // Add cache buster to force reload
    return `${base}${value.includes('?') ? '&' : '?'}v=${Date.now()}`;
  }, [value, isExternalUrl]);

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
        id="image-upload-input"
      />

      {/* Preview with Replace/Remove when image exists */}
      {hasImage ? (
        <div className="flex items-start gap-3">
          <div className="relative">
            <img
              key={value} // Force re-mount when URL changes
              src={imageSrc}
              alt="Preview"
              className="h-24 w-24 rounded-lg border object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
            {isExternalUrl && (
              <span className="absolute bottom-1 left-1 rounded bg-black/70 px-1 text-[10px] font-medium uppercase tracking-wide text-white">
                Stripe CDN
              </span>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={triggerUpload}
              disabled={uploading}
              className="h-8"
            >
              {uploading ? (
                <>
                  <Loader2 className="mr-2 h-3 w-3 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <RefreshCw className="mr-2 h-3 w-3" />
                  Replace
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              disabled={uploading}
              className="h-8 text-destructive hover:text-destructive"
            >
              <X className="mr-2 h-3 w-3" />
              Remove
            </Button>
          </div>
        </div>
      ) : (
        /* Upload button when no image */
        <Button
          type="button"
          variant="outline"
          onClick={triggerUpload}
          disabled={uploading}
          className="w-full"
        >
          {uploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload Image
            </>
          )}
        </Button>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        Upload a JPEG, PNG, GIF, WebP, or SVG (max 5MB). Images sync to Stripe automatically.
      </p>
    </div>
  );
};
