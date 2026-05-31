import * as Y from 'yjs';

const SNAPSHOT_INTERVAL_MS = 30_000;
const MAX_UPDATES_PER_ROOM = 5000;
const MAX_SNAPSHOTS_PER_ROOM = 200;

let redis = null;
let useRedis = false;

try {
  const Redis = (await import('ioredis')).default;
  redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) return null;
      return Math.min(times * 200, 2000);
    },
    lazyConnect: true,
    connectTimeout: 3000,
  });

  redis.on('error', (err) => {
    console.warn('[HistoryStore] Redis unavailable, using in-memory fallback:', err.message);
    useRedis = false;
  });

  redis.on('ready', () => {
    console.log('[HistoryStore] Redis connected');
    useRedis = true;
  });

  await redis.connect().catch(() => {
    console.warn('[HistoryStore] Redis connection failed, using in-memory fallback');
    useRedis = false;
  });
} catch (err) {
  console.warn('[HistoryStore] ioredis not available, using in-memory fallback');
  useRedis = false;
}

const memoryStore = {
  updates: new Map(),
  snapshots: new Map(),
};

function getUpdateKey(roomId) {
  return `yjs:updates:${roomId}`;
}

function getSnapshotKey(roomId) {
  return `yjs:snapshots:${roomId}`;
}

function getTimestampKey(roomId) {
  return `yjs:timestamps:${roomId}`;
}

function bufferToBase64(buf) {
  return Buffer.from(buf).toString('base64');
}

function base64ToBuffer(b64) {
  return Buffer.from(b64, 'base64');
}

async function storeUpdate(roomId, update, timestamp) {
  const entry = JSON.stringify({
    t: timestamp,
    u: bufferToBase64(update),
  });

  if (useRedis && redis && redis.status === 'ready') {
    try {
      const key = getUpdateKey(roomId);
      const tsKey = getTimestampKey(roomId);
      await redis.rpush(key, entry);
      await redis.rpush(tsKey, String(timestamp));
      const len = await redis.llen(key);
      if (len > MAX_UPDATES_PER_ROOM) {
        await redis.ltrim(key, len - MAX_UPDATES_PER_ROOM, -1);
        await redis.ltrim(tsKey, len - MAX_UPDATES_PER_ROOM, -1);
      }
      return;
    } catch (err) {
      console.warn('[HistoryStore] Redis write failed, falling back to memory:', err.message);
    }
  }

  if (!memoryStore.updates.has(roomId)) {
    memoryStore.updates.set(roomId, []);
  }
  const arr = memoryStore.updates.get(roomId);
  arr.push(entry);
  if (arr.length > MAX_UPDATES_PER_ROOM) {
    memoryStore.updates.set(roomId, arr.slice(arr.length - MAX_UPDATES_PER_ROOM));
  }
}

async function storeSnapshot(roomId, ydoc, timestamp) {
  const state = Y.encodeStateAsUpdate(ydoc);
  const snapshot = JSON.stringify({
    t: timestamp,
    s: bufferToBase64(state),
  });

  if (useRedis && redis && redis.status === 'ready') {
    try {
      const key = getSnapshotKey(roomId);
      await redis.rpush(key, snapshot);
      const len = await redis.llen(key);
      if (len > MAX_SNAPSHOTS_PER_ROOM) {
        await redis.ltrim(key, len - MAX_SNAPSHOTS_PER_ROOM, -1);
      }
      return;
    } catch (err) {
      console.warn('[HistoryStore] Redis snapshot write failed, falling back to memory:', err.message);
    }
  }

  if (!memoryStore.snapshots.has(roomId)) {
    memoryStore.snapshots.set(roomId, []);
  }
  const arr = memoryStore.snapshots.get(roomId);
  arr.push(snapshot);
  if (arr.length > MAX_SNAPSHOTS_PER_ROOM) {
    memoryStore.snapshots.set(roomId, arr.slice(arr.length - MAX_SNAPSHOTS_PER_ROOM));
  }
}

async function getTimestamps(roomId) {
  let entries;

  if (useRedis && redis && redis.status === 'ready') {
    try {
      const updateTs = await redis.lrange(getTimestampKey(roomId), 0, -1);
      const snapshotData = await redis.lrange(getSnapshotKey(roomId), 0, -1);
      const snapshotTs = snapshotData.map((s) => JSON.parse(s).t);
      entries = [...new Set([...snapshotTs.map(Number), ...updateTs.map(Number)])];
    } catch (err) {
      console.warn('[HistoryStore] Redis read failed, falling back to memory:', err.message);
    }
  }

  if (!entries) {
    const updates = memoryStore.updates.get(roomId) || [];
    const snapshots = memoryStore.snapshots.get(roomId) || [];
    const updateTs = updates.map((u) => JSON.parse(u).t);
    const snapshotTs = snapshots.map((s) => JSON.parse(s).t);
    entries = [...new Set([...snapshotTs, ...updateTs])];
  }

  return entries.sort((a, b) => a - b);
}

async function getStateAtTimestamp(roomId, timestamp) {
  const tempDoc = new Y.Doc({ gc: false });

  let snapshots = [];
  let updates = [];

  if (useRedis && redis && redis.status === 'ready') {
    try {
      const snapshotData = await redis.lrange(getSnapshotKey(roomId), 0, -1);
      snapshots = snapshotData.map((s) => JSON.parse(s));

      const updateData = await redis.lrange(getUpdateKey(roomId), 0, -1);
      updates = updateData.map((u) => JSON.parse(u));
    } catch (err) {
      console.warn('[HistoryStore] Redis read failed, falling back to memory:', err.message);
    }
  }

  if (snapshots.length === 0 && updates.length === 0) {
    const memSnapshots = memoryStore.snapshots.get(roomId) || [];
    snapshots = memSnapshots.map((s) => JSON.parse(s));
    const memUpdates = memoryStore.updates.get(roomId) || [];
    updates = memUpdates.map((u) => JSON.parse(u));
  }

  let latestSnapshot = null;
  for (const snap of snapshots) {
    if (snap.t <= timestamp) {
      if (!latestSnapshot || snap.t > latestSnapshot.t) {
        latestSnapshot = snap;
      }
    }
  }

  if (latestSnapshot) {
    Y.applyUpdate(tempDoc, base64ToBuffer(latestSnapshot.s));
  }

  const relevantUpdates = updates
    .filter((u) => {
      if (latestSnapshot && u.t <= latestSnapshot.t) return false;
      return u.t <= timestamp;
    })
    .sort((a, b) => a.t - b.t);

  for (const u of relevantUpdates) {
    Y.applyUpdate(tempDoc, base64ToBuffer(u.u));
  }

  const content = tempDoc.getText('monaco').toString();
  const fullState = Y.encodeStateAsUpdate(tempDoc);
  tempDoc.destroy();

  return {
    content,
    state: bufferToBase64(fullState),
    timestamp,
  };
}

const snapshotTimers = new Map();

function startSnapshotLoop(roomId, ydoc) {
  if (snapshotTimers.has(roomId)) return;

  const timer = setInterval(async () => {
    try {
      await storeSnapshot(roomId, ydoc, Date.now());
    } catch (err) {
      console.error(`[HistoryStore] Snapshot error for room ${roomId}:`, err.message);
    }
  }, SNAPSHOT_INTERVAL_MS);

  snapshotTimers.set(roomId, timer);
}

function stopSnapshotLoop(roomId) {
  const timer = snapshotTimers.get(roomId);
  if (timer) {
    clearInterval(timer);
    snapshotTimers.delete(roomId);
  }
}

async function forceSnapshot(roomId, ydoc) {
  const timestamp = Date.now();
  await storeSnapshot(roomId, ydoc, timestamp);
  return timestamp;
}

async function getHistorySummary(roomId) {
  const timestamps = await getTimestamps(roomId);
  if (timestamps.length === 0) {
    return { count: 0, first: null, last: null, snapshots: 0 };
  }

  let snapshotCount = 0;
  if (useRedis && redis && redis.status === 'ready') {
    try {
      snapshotCount = await redis.llen(getSnapshotKey(roomId));
    } catch (_) {}
  } else {
    snapshotCount = (memoryStore.snapshots.get(roomId) || []).length;
  }

  return {
    count: timestamps.length,
    first: timestamps[0],
    last: timestamps[timestamps.length - 1],
    snapshots: snapshotCount,
  };
}

export {
  storeUpdate,
  storeSnapshot,
  getTimestamps,
  getStateAtTimestamp,
  startSnapshotLoop,
  stopSnapshotLoop,
  forceSnapshot,
  getHistorySummary,
  useRedis,
};
