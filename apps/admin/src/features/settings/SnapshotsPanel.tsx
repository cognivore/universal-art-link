import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../../components/ui/card';
import { Button } from '../../components/ui/button';
import { Badge } from '../../components/ui/badge';
import { getRuntimeConfig } from '../../lib/runtime-config';

type Snapshot = {
  id: string;
  name: string;
  createdAt: string;
  createdBy: string;
  size: number;
};

type SnapshotsState = 'idle' | 'loading' | 'creating' | 'restoring';

const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const formatDate = (dateStr: string): string => {
  const date = new Date(dateStr);
  return date.toLocaleString();
};

export const SnapshotsPanel = () => {
  const [state, setState] = useState<SnapshotsState>('idle');
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [snapshotName, setSnapshotName] = useState('');

  const config = getRuntimeConfig();

  const loadSnapshots = async () => {
    try {
      setState('loading');
      setError(null);
      const response = await fetch(`${config.apiBaseUrl}/admin/snapshots`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load snapshots');
      }
      const data = await response.json();
      setSnapshots(data.snapshots || []);
      setState('idle');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load snapshots');
      setState('idle');
    }
  };

  useEffect(() => {
    void loadSnapshots();
  }, []);

  const handleCreate = async () => {
    const name = snapshotName.trim() || `Snapshot ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`;

    if (!window.confirm(`Create snapshot "${name}"?\n\nThis will save the current state of all content and assets.`)) {
      return;
    }

    try {
      setState('creating');
      setError(null);
      const response = await fetch(`${config.apiBaseUrl}/admin/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to create snapshot');
      }
      setSnapshotName('');
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create snapshot');
      setState('idle');
    }
  };

  const handleRestore = async (snapshot: Snapshot) => {
    if (!window.confirm(
      `Restore snapshot "${snapshot.name}"?\n\n` +
      `Created: ${formatDate(snapshot.createdAt)}\n\n` +
      `⚠️ This will REPLACE all current content and assets with the snapshot data. This cannot be undone!`
    )) {
      return;
    }

    try {
      setState('restoring');
      setError(null);
      const response = await fetch(`${config.apiBaseUrl}/admin/snapshots/${snapshot.id}/restore`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to restore snapshot');
      }
      alert('Snapshot restored successfully! The page will reload.');
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore snapshot');
      setState('idle');
    }
  };

  const handleDelete = async (snapshot: Snapshot) => {
    if (!window.confirm(`Delete snapshot "${snapshot.name}"?\n\nThis cannot be undone.`)) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`${config.apiBaseUrl}/admin/snapshots/${snapshot.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete snapshot');
      }
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete snapshot');
    }
  };

  const handleRename = async (snapshot: Snapshot) => {
    const newName = window.prompt('Enter new name for snapshot:', snapshot.name);
    if (!newName || newName.trim() === snapshot.name) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`${config.apiBaseUrl}/admin/snapshots/${snapshot.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to rename snapshot');
      }
      await loadSnapshots();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to rename snapshot');
    }
  };

  const isLoading = state === 'loading' || state === 'creating' || state === 'restoring';

  return (
    <Card className="bg-white/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <span className="text-2xl">📸</span>
          Snapshots
        </CardTitle>
        <CardDescription>
          Create save states of your content and assets. Restore them anytime.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Create Snapshot */}
        <div className="rounded-lg border p-4">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label htmlFor="snapshot-name" className="mb-1 block text-sm font-medium">
                Snapshot Name (optional)
              </label>
              <input
                id="snapshot-name"
                type="text"
                value={snapshotName}
                onChange={(e) => setSnapshotName(e.target.value)}
                placeholder={`Snapshot ${new Date().toISOString().slice(0, 10)}`}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                disabled={isLoading}
              />
            </div>
            <Button onClick={handleCreate} disabled={isLoading}>
              {state === 'creating' ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Creating...
                </span>
              ) : (
                'Create Snapshot'
              )}
            </Button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Snapshots List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Saved Snapshots</h4>
            <Button variant="ghost" size="sm" onClick={loadSnapshots} disabled={isLoading}>
              Refresh
            </Button>
          </div>

          {state === 'loading' && snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              Loading snapshots...
            </div>
          ) : snapshots.length === 0 ? (
            <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
              No snapshots yet. Create one to save your current state.
            </div>
          ) : (
            <div className="space-y-2">
              {snapshots.map((snapshot) => (
                <div
                  key={snapshot.id}
                  className="flex items-center justify-between rounded-lg border bg-white p-3"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{snapshot.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {formatBytes(snapshot.size)}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(snapshot.createdAt)} by {snapshot.createdBy}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRename(snapshot)}
                      disabled={isLoading}
                    >
                      Rename
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleRestore(snapshot)}
                      disabled={isLoading}
                    >
                      Restore
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(snapshot)}
                      disabled={isLoading}
                      className="text-red-600 hover:bg-red-50 hover:text-red-700"
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h4 className="font-medium text-slate-800">What Gets Saved</h4>
          <ul className="mt-2 space-y-1 text-sm text-slate-600">
            <li className="flex items-center gap-2">
              <span className="text-blue-500">📄</span>
              <strong>Content:</strong> Pages, commerce config, site settings
            </li>
            <li className="flex items-center gap-2">
              <span className="text-purple-500">🖼️</span>
              <strong>Assets:</strong> Images, SVGs, media files
            </li>
            <li className="flex items-center gap-2">
              <span className="text-green-500">💳</span>
              <strong>Products:</strong> Local product data (Stripe products are not affected)
            </li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
};

