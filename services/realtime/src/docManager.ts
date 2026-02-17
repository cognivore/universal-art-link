import * as Y from 'yjs';
import type { DraftRepo } from '@ual/storage';

type DocEntry = {
  doc: Y.Doc;
  docVersion: number;
  clients: Set<WebSocket>;
};

/**
 * Manages in-memory Y.Docs per tenant.
 * Loads from DB on first access, persists updates to crdt_updates.
 */
export const createDocManager = (draftRepo: DraftRepo) => {
  const docs = new Map<string, DocEntry>();

  const loadDoc = async (tenantId: string): Promise<DocEntry> => {
    const existing = docs.get(tenantId);
    if (existing) return existing;

    const draft = await draftRepo.ensureDraft(tenantId);
    const doc = new Y.Doc();

    const updates = await draftRepo.getUpdates(tenantId, draft.docVersion);
    for (const u of updates) {
      Y.applyUpdate(doc, u.updateData);
    }

    const entry: DocEntry = {
      doc,
      docVersion: draft.docVersion,
      clients: new Set(),
    };

    docs.set(tenantId, entry);
    return entry;
  };

  const applyAndPersist = async (
    tenantId: string,
    update: Uint8Array,
    origin: WebSocket,
  ): Promise<void> => {
    const entry = docs.get(tenantId);
    if (!entry) return;

    Y.applyUpdate(entry.doc, update);
    await draftRepo.appendUpdate(tenantId, entry.docVersion, update);

    for (const client of entry.clients) {
      if (client !== origin && client.readyState === WebSocket.OPEN) {
        client.send(update);
      }
    }
  };

  const addClient = async (tenantId: string, ws: WebSocket): Promise<Y.Doc> => {
    const entry = await loadDoc(tenantId);
    entry.clients.add(ws);
    return entry.doc;
  };

  const removeClient = (tenantId: string, ws: WebSocket): void => {
    const entry = docs.get(tenantId);
    if (!entry) return;
    entry.clients.delete(ws);

    if (entry.clients.size === 0) {
      docs.delete(tenantId);
    }
  };

  return { loadDoc, applyAndPersist, addClient, removeClient };
};

export type DocManager = ReturnType<typeof createDocManager>;
