import * as Y from 'yjs';
import {
  saveSnapshot,
  getSnapshots,
  pruneSnapshots,
  type SnapshotRecord,
} from '@/utils/db';

const SNAPSHOT_INTERVAL_MS = 30_000;
const MAX_SNAPSHOTS = 200;

export interface SnapshotMeta {
  id: string;
  docId: string;
  charCount: number;
  timestamp: number;
  label?: string;
}

let snapshotTimer: ReturnType<typeof setInterval> | null = null;

export function startAutoSnapshot(
  docId: string,
  ydoc: Y.Doc,
  title: string,
  onSnapshot?: (meta: SnapshotMeta) => void,
): void {
  stopAutoSnapshot();

  takeSnapshot(docId, ydoc, title).then((meta) => {
    if (meta && onSnapshot) onSnapshot(meta);
  });

  snapshotTimer = setInterval(async () => {
    const meta = await takeSnapshot(docId, ydoc, title);
    if (meta && onSnapshot) onSnapshot(meta);
    await pruneSnapshots(docId, MAX_SNAPSHOTS);
  }, SNAPSHOT_INTERVAL_MS);
}

export function stopAutoSnapshot(): void {
  if (snapshotTimer !== null) {
    clearInterval(snapshotTimer);
    snapshotTimer = null;
  }
}

export async function takeSnapshot(
  docId: string,
  ydoc: Y.Doc,
  title: string,
  label?: string,
): Promise<SnapshotMeta | null> {
  try {
    const yjsState = Y.encodeStateAsUpdate(ydoc);
    const yjsStateVector = Y.encodeStateVector(ydoc);
    const ytext = ydoc.getText('content');
    const charCount = ytext.length;

    const snapshot: SnapshotRecord = {
      id: `snap-${docId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      docId,
      yjsState,
      yjsStateVector,
      title,
      charCount,
      timestamp: Date.now(),
      label,
    };

    await saveSnapshot(snapshot);

    return {
      id: snapshot.id,
      docId,
      charCount,
      timestamp: snapshot.timestamp,
      label,
    };
  } catch (err) {
    console.error('Failed to take snapshot:', err);
    return null;
  }
}

export async function loadSnapshotMetas(docId: string): Promise<SnapshotMeta[]> {
  const snapshots = await getSnapshots(docId);
  return snapshots.map((s) => ({
    id: s.id,
    docId: s.docId,
    charCount: s.charCount,
    timestamp: s.timestamp,
    label: s.label,
  }));
}

export function restoreFromSnapshotState(
  currentYdoc: Y.Doc,
  snapshotState: Uint8Array,
): void {
  const ytext = currentYdoc.getText('content');
  const snapshotDoc = new Y.Doc();
  Y.applyUpdate(snapshotDoc, snapshotState);
  const snapshotText = snapshotDoc.getText('content').toString();
  snapshotDoc.destroy();

  currentYdoc.transact(() => {
    const currentLength = ytext.length;
    if (currentLength > 0) {
      ytext.delete(0, currentLength);
    }
    if (snapshotText.length > 0) {
      ytext.insert(0, snapshotText);
    }
  });
}
