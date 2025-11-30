import { useState, useRef, useCallback } from 'react';
import { Upload, Link, X, Loader2 } from 'lucide-react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { getRuntimeConfig } from '../../lib/runtime-config';

type ImageUploadProps = {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  placeholder?: string;
};

const getApiBase = () => {
  const config = getRuntimeConfig();
  return config.previewBaseUrl;
};

export const ImageUpload = ({
  value,
  onChange,
  label = 'Image',
  placeholder = '/assets/product.png or https://...',
}: ImageUploadProps) => {
  const [mode, setMode] = useState<'url' | 'upload'>('url');
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
        setMode('url'); // Switch back to URL mode to show the result
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

  const isExternalUrl = value.startsWith('http://') || value.startsWith('https://');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label>{label}</Label>
        <div className="flex gap-1">
          <Button
            type="button"
            variant={mode === 'url' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('url')}
            className="h-7 px-2 text-xs"
          >
            <Link className="mr-1 h-3 w-3" />
            URL
          </Button>
          <Button
            type="button"
            variant={mode === 'upload' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('upload')}
            className="h-7 px-2 text-xs"
          >
            <Upload className="mr-1 h-3 w-3" />
            Upload
          </Button>
        </div>
      </div>

      {/* Preview */}
      {value && (
        <div className="relative inline-block">
          <img
            src={isExternalUrl ? value : `${getApiBase()}${value}`}
            alt="Preview"
            className="h-24 w-24 rounded-lg border object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleClear}
            className="absolute -right-2 -top-2 h-6 w-6 rounded-full p-0"
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}

      {/* URL Input Mode */}
      {mode === 'url' && (
        <Input
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            setError(null);
          }}
        />
      )}

      {/* Upload Mode */}
      {mode === 'upload' && (
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            onChange={handleFileSelect}
            className="hidden"
            id="image-upload-input"
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => fileInputRef.current?.click()}
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
                Choose Image
              </>
            )}
          </Button>
        </div>
      )}

      {/* Error message */}
      {error && <p className="text-sm text-red-500">{error}</p>}

      {/* Help text */}
      <p className="text-xs text-muted-foreground">
        {mode === 'url'
          ? 'Enter a URL from Stripe, or a local path like /assets/image.png'
          : 'Upload a JPEG, PNG, GIF, WebP, or SVG (max 5MB)'}
      </p>
    </div>
  );
};

