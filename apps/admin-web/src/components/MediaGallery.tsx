import React, { useState, useEffect, useCallback, useRef } from 'react';
import { mediaApi, type MediaAsset } from '../api.js';

type GalleryProps = {
  readonly onSelect?: (asset: MediaAsset) => void;
  readonly pickerMode?: boolean;
};

export const MediaGallery: React.FC<GalleryProps> = ({ onSelect, pickerMode }) => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      setAssets(await mediaApi.list());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const upload = async (files: FileList | File[]) => {
    setUploading(true);
    setError('');
    try {
      const results = await Promise.all(
        Array.from(files).map((f) => mediaApi.upload(f)),
      );
      setAssets((prev) => [...results, ...prev]);
      if (results.length === 1 && onSelect) onSelect(results[0]!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
  };

  const images = assets.filter((a) => a.mime.startsWith('image/'));

  return (
    <div className="panel media-gallery">
      {!pickerMode && <h2>Media Library</h2>}

      <div
        className={`drop-zone ${dragOver ? 'drop-zone--active' : ''}`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => fileRef.current?.click()}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => e.target.files && upload(e.target.files)}
        />
        {uploading ? 'Uploading...' : 'Drop images here or click to upload'}
      </div>

      {error && <p className="error-msg">{error}</p>}

      <div className="media-grid">
        {images.map((asset) => (
          <button
            key={asset.id}
            className="media-thumb"
            onClick={() => onSelect?.(asset)}
            type="button"
          >
            <img src={asset.url} alt="" loading="lazy" />
          </button>
        ))}
        {images.length === 0 && !uploading && (
          <p className="empty-state">No images uploaded yet</p>
        )}
      </div>
    </div>
  );
};

type PickerProps = {
  readonly currentUrl?: string;
  readonly onSelect: (asset: MediaAsset) => void;
};

export const ImagePicker: React.FC<PickerProps> = ({ currentUrl, onSelect }) => {
  const [open, setOpen] = useState(false);

  return (
    <div className="image-picker">
      {currentUrl ? (
        <div className="image-picker-preview">
          <img src={currentUrl} alt="" />
          <div className="image-picker-actions">
            <button type="button" onClick={() => setOpen(true)}>Change</button>
            <button type="button" onClick={() => onSelect({ id: '', url: '', mime: '', storageKey: '', createdAt: '' })}>Remove</button>
          </div>
        </div>
      ) : (
        <button type="button" className="image-picker-add" onClick={() => setOpen(true)}>
          + Choose image
        </button>
      )}

      {open && (
        <div className="modal-overlay" onClick={() => setOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Select Image</h3>
              <button type="button" onClick={() => setOpen(false)}>&times;</button>
            </div>
            <MediaGallery
              pickerMode
              onSelect={(asset) => {
                onSelect(asset);
                setOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
