import type { OutboxOp } from "./types";

const DB_NAME = "proofpod-outbox";
const STORE = "ops";

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory = new Map<string, OutboxOp>();

/** IndexedDB, or null when unavailable (e.g. some private modes) — then ops live in memory only. */
function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === "undefined") return resolve(null);
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE, { keyPath: "id" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function wrap<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll(): Promise<OutboxOp[]> {
  const db = await openDb();
  if (!db) return [...memory.values()].sort((a, b) => a.seq - b.seq);
  try {
    const all = (await wrap(db.transaction(STORE, "readonly").objectStore(STORE).getAll())) as OutboxOp[];
    return all.sort((a, b) => a.seq - b.seq);
  } catch {
    return [...memory.values()].sort((a, b) => a.seq - b.seq);
  }
}

export async function putOp(op: OutboxOp): Promise<void> {
  const db = await openDb();
  if (!db) {
    memory.set(op.id, op);
    return;
  }
  try {
    await wrap(db.transaction(STORE, "readwrite").objectStore(STORE).put(op));
  } catch {
    memory.set(op.id, op);
  }
}

export async function removeOp(id: string): Promise<void> {
  memory.delete(id);
  const db = await openDb();
  if (!db) return;
  try {
    await wrap(db.transaction(STORE, "readwrite").objectStore(STORE).delete(id));
  } catch {
    /* already gone */
  }
}

export async function getOp(id: string): Promise<OutboxOp | undefined> {
  const db = await openDb();
  if (!db) return memory.get(id);
  try {
    return ((await wrap(db.transaction(STORE, "readonly").objectStore(STORE).get(id))) as OutboxOp | undefined) ?? memory.get(id);
  } catch {
    return memory.get(id);
  }
}
