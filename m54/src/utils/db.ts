import { openDB, IDBPDatabase } from "idb";

export interface DocumentRecord {
  id: string;
  title: string;
  encryptedContent: Uint8Array;
  encryptedKey: string;
  salt: Uint8Array;
  iv: Uint8Array;
  yjsStateVector: Uint8Array;
  createdAt: number;
  updatedAt: number;
}

export interface PendingUpdateRecord {
  id: string;
  docId: string;
  encryptedUpdate: Uint8Array;
  iv: Uint8Array;
  timestamp: number;
  synced: boolean;
}

const DB_NAME = "cryptopad-db";
const DB_VERSION = 2;

export interface SnapshotRecord {
  id: string;
  docId: string;
  yjsState: Uint8Array;
  yjsStateVector: Uint8Array;
  title: string;
  charCount: number;
  timestamp: number;
  label?: string;
}

export function getDB(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("documents")) {
        db.createObjectStore("documents", { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains("pendingUpdates")) {
        const pendingStore = db.createObjectStore("pendingUpdates", {
          keyPath: "id",
        });
        pendingStore.createIndex("docId", "docId");
        pendingStore.createIndex("synced", "synced");
      }

      if (!db.objectStoreNames.contains("snapshots")) {
        const snapshotStore = db.createObjectStore("snapshots", {
          keyPath: "id",
        });
        snapshotStore.createIndex("docId", "docId");
        snapshotStore.createIndex("timestamp", "timestamp");
      }
    },
  });
}

export async function getAllDocuments(): Promise<DocumentRecord[]> {
  const db = await getDB();
  return db.getAll("documents");
}

export async function getDocument(
  id: string
): Promise<DocumentRecord | undefined> {
  const db = await getDB();
  return db.get("documents", id);
}

export async function saveDocument(doc: DocumentRecord): Promise<void> {
  const db = await getDB();
  await db.put("documents", doc);
}

export async function deleteDocument(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("documents", id);
}

export async function getPendingUpdates(
  docId: string
): Promise<PendingUpdateRecord[]> {
  const db = await getDB();
  return db.getAllFromIndex("pendingUpdates", "docId", docId);
}

export async function getUnsyncedUpdates(
  docId: string
): Promise<PendingUpdateRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("pendingUpdates", "docId", docId);
  return all.filter((u) => !u.synced);
}

export async function addPendingUpdate(
  update: PendingUpdateRecord
): Promise<void> {
  const db = await getDB();
  await db.put("pendingUpdates", update);
}

export async function markUpdateSynced(id: string): Promise<void> {
  const db = await getDB();
  const record = await db.get("pendingUpdates", id);
  if (record) {
    record.synced = true;
    await db.put("pendingUpdates", record);
  }
}

export async function deleteSyncedUpdates(docId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("pendingUpdates", "readwrite");
  const store = tx.objectStore("pendingUpdates");
  const index = store.index("docId");
  let cursor = await index.openCursor(docId);
  while (cursor) {
    if (cursor.value.synced) {
      await cursor.delete();
    }
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function savePendingUpdate(
  docId: string,
  update: Uint8Array,
  cryptoKey?: CryptoKey
): Promise<void> {
  let encryptedUpdate = update;
  let iv = new Uint8Array(12);

  if (cryptoKey) {
    const { encrypt } = await import("@/utils/crypto");
    const payload = await encrypt(update, cryptoKey);
    encryptedUpdate = payload.ciphertext;
    iv = payload.iv;
  }

  const record: PendingUpdateRecord = {
    id: `${docId}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    docId,
    encryptedUpdate,
    iv,
    timestamp: Date.now(),
    synced: false,
  };

  await addPendingUpdate(record);
}

export async function clearAllData(): Promise<void> {
  const db = await getDB();
  const tx = db.transaction(["documents", "pendingUpdates", "snapshots"], "readwrite");
  await tx.objectStore("documents").clear();
  await tx.objectStore("pendingUpdates").clear();
  await tx.objectStore("snapshots").clear();
  await tx.done;
}

export async function saveSnapshot(snapshot: SnapshotRecord): Promise<void> {
  const db = await getDB();
  await db.put("snapshots", snapshot);
}

export async function getSnapshots(docId: string): Promise<SnapshotRecord[]> {
  const db = await getDB();
  const all = await db.getAllFromIndex("snapshots", "docId", docId);
  return all.sort((a, b) => a.timestamp - b.timestamp);
}

export async function getSnapshot(id: string): Promise<SnapshotRecord | undefined> {
  const db = await getDB();
  return db.get("snapshots", id);
}

export async function deleteSnapshot(id: string): Promise<void> {
  const db = await getDB();
  await db.delete("snapshots", id);
}

export async function deleteSnapshotsByDocId(docId: string): Promise<void> {
  const db = await getDB();
  const tx = db.transaction("snapshots", "readwrite");
  const index = tx.objectStore("snapshots").index("docId");
  let cursor = await index.openCursor(docId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  await tx.done;
}

export async function pruneSnapshots(docId: string, keepCount: number): Promise<void> {
  const snapshots = await getSnapshots(docId);
  if (snapshots.length <= keepCount) return;
  const toDelete = snapshots.slice(0, snapshots.length - keepCount);
  const db = await getDB();
  const tx = db.transaction("snapshots", "readwrite");
  for (const s of toDelete) {
    await tx.objectStore("snapshots").delete(s.id);
  }
  await tx.done;
}
