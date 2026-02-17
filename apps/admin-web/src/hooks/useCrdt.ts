import { useState, useEffect, useRef, useCallback } from 'react';
import * as Y from 'yjs';
import { encoding, decoding } from 'lib0';
import * as syncProtocol from 'y-protocols/sync';

const MSG_SYNC = 0;

type SyncStatus = 'connecting' | 'syncing' | 'synced' | 'disconnected';

type CrdtHook = {
  doc: Y.Doc;
  status: SyncStatus;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
};

export const useCrdt = (): CrdtHook => {
  const docRef = useRef(new Y.Doc());
  const wsRef = useRef<WebSocket | null>(null);
  const undoManagerRef = useRef<Y.UndoManager | null>(null);

  const [status, setStatus] = useState<SyncStatus>('disconnected');
  const [, setTick] = useState(0);

  const forceUpdate = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const doc = docRef.current;

    const siteMap = doc.getMap('site');
    siteMap.observeDeep(forceUpdate);

    const undoManager = new Y.UndoManager(siteMap, {
      captureTimeout: 500,
    });
    undoManagerRef.current = undoManager;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/crdt`;

    const connect = () => {
      setStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.binaryType = 'arraybuffer';

      ws.onopen = () => {
        setStatus('syncing');
      };

      ws.onmessage = (event) => {
        const data = new Uint8Array(event.data as ArrayBuffer);
        const decoder = decoding.createDecoder(data);
        const msgType = decoding.readVarUint(decoder);

        if (msgType === MSG_SYNC) {
          const responseEncoder = encoding.createEncoder();
          encoding.writeVarUint(responseEncoder, MSG_SYNC);

          syncProtocol.readSyncMessage(decoder, responseEncoder, doc, ws);

          if (encoding.length(responseEncoder) > 1) {
            ws.send(encoding.toUint8Array(responseEncoder));
          }
          setStatus('synced');
        }
      };

      ws.onclose = () => {
        setStatus('disconnected');
        setTimeout(connect, 2000);
      };

      ws.onerror = () => ws.close();
    };

    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === wsRef.current) return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MSG_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        ws.send(encoding.toUint8Array(encoder));
      }
    });

    connect();

    return () => {
      siteMap.unobserveDeep(forceUpdate);
      undoManager.destroy();
      wsRef.current?.close();
    };
  }, [forceUpdate]);

  const undo = useCallback(() => undoManagerRef.current?.undo(), []);
  const redo = useCallback(() => undoManagerRef.current?.redo(), []);

  return {
    doc: docRef.current,
    status,
    undo,
    redo,
    canUndo: undoManagerRef.current?.canUndo() ?? false,
    canRedo: undoManagerRef.current?.canRedo() ?? false,
  };
};
