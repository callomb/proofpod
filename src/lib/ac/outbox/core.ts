import type { EnqueueResult, OpSpec, OutboxOp } from "./types";

export type ExecOutcome = { kind: "ok" } | { kind: "server"; error: string } | { kind: "transient" };

export interface OutboxDeps {
  store: {
    loadAll(): Promise<OutboxOp[]>;
    putOp(op: OutboxOp): Promise<void>;
    removeOp(id: string): Promise<void>;
    getOp(id: string): Promise<OutboxOp | undefined>;
  };
  /** Performs one op. "transient" = couldn't reach the server (retry later); "server" = the server said no. */
  execute(op: OutboxOp): Promise<ExecOutcome>;
  /** Mutual exclusion (across tabs where possible) around sending. */
  withLock<T>(fn: () => Promise<T>): Promise<T>;
  now(): Date;
  uuid(): string;
  /** Tell other tabs the stored queue changed. */
  notifyOthers?(): void;
  /** How long a just-sent op keeps counting as "applied" in the UI while the page refreshes. */
  syncedLingerMs?: number;
}

export function createOutbox(deps: OutboxDeps) {
  let ops: OutboxOp[] = [];
  let snapshot: OutboxOp[] = [];
  let loaded = false;
  let lastSeq = 0;
  const listeners = new Set<() => void>();
  const syncedListeners = new Set<() => void>();

  const emit = () => {
    snapshot = [...ops];
    listeners.forEach((l) => l());
  };

  async function reload() {
    const stored = await deps.store.loadAll();
    const storedIds = new Set(stored.map((o) => o.id));
    const lingering = ops.filter((o) => o.status === "synced" && !storedIds.has(o.id));
    ops = [...stored, ...lingering].sort((a, b) => a.seq - b.seq);
    emit();
  }

  async function init() {
    if (loaded) return;
    loaded = true;
    await reload();
  }

  const laneBlocked = (op: OutboxOp) =>
    ops.some(
      (o) =>
        o !== op &&
        o.spec.lane === op.spec.lane &&
        o.seq < op.seq &&
        (o.status === "pending" || o.status === "failed"),
    );

  function clearSyncedSoon() {
    setTimeout(() => {
      ops = ops.filter((o) => o.status !== "synced");
      emit();
    }, deps.syncedLingerMs ?? 4000);
  }

  async function finishOk(op: OutboxOp, background: boolean) {
    op.status = "synced";
    op.blob = undefined;
    await deps.store.removeOp(op.id);
    deps.notifyOthers?.();
    emit();
    clearSyncedSoon();
    if (background) syncedListeners.forEach((l) => l());
  }

  async function markFailed(op: OutboxOp, error: string) {
    op.status = "failed";
    op.error = error;
    await deps.store.putOp(op);
    deps.notifyOthers?.();
    emit();
  }

  async function dropLocal(op: OutboxOp) {
    ops = ops.filter((o) => o !== op);
    await deps.store.removeOp(op.id);
    deps.notifyOthers?.();
    emit();
  }

  /** Runs one op now, unless something earlier in its lane is still waiting. */
  async function attempt(id: string, firstAttempt: boolean): Promise<EnqueueResult> {
    return deps.withLock(async () => {
      const op = ops.find((o) => o.id === id);
      if (!op) return { status: "done" };
      if (op.status === "synced") return { status: "done" };
      if (op.status === "failed") return { status: "queued" };
      // Another tab may already have sent it.
      if (!(await deps.store.getOp(id))) {
        op.status = "synced";
        emit();
        clearSyncedSoon();
        return { status: "done" };
      }
      if (laneBlocked(op)) return { status: "queued" };

      const out = await deps.execute(op);
      if (out.kind === "ok") {
        await finishOk(op, !firstAttempt);
        return { status: "done" };
      }
      if (out.kind === "server") {
        if (firstAttempt) {
          await dropLocal(op);
          return { status: "error", error: out.error };
        }
        await markFailed(op, out.error);
        return { status: "queued" };
      }
      op.attempts += 1;
      await deps.store.putOp(op);
      emit();
      return { status: "queued" };
    });
  }

  async function enqueue(spec: OpSpec, blob?: Blob): Promise<EnqueueResult> {
    await init();
    const at = deps.now().toISOString();
    lastSeq = Math.max(deps.now().getTime(), lastSeq + 1);
    const op: OutboxOp = {
      id: deps.uuid(),
      seq: lastSeq,
      capturedAt: at,
      createdAt: at,
      status: "pending",
      attempts: 0,
      spec,
      blob,
    };
    await deps.store.putOp(op);
    ops.push(op);
    deps.notifyOthers?.();
    emit();
    return attempt(op.id, true);
  }

  /** Sends everything waiting, oldest first; stops at the first "no signal". */
  async function processAll(): Promise<void> {
    await init();
    await deps.withLock(async () => {
      await reload();
      const blocked = new Set(ops.filter((o) => o.status === "failed").map((o) => o.spec.lane));
      for (const op of ops.filter((o) => o.status === "pending")) {
        if (blocked.has(op.spec.lane)) continue;
        const out = await deps.execute(op);
        if (out.kind === "ok") {
          await finishOk(op, true);
        } else if (out.kind === "server") {
          await markFailed(op, out.error);
          blocked.add(op.spec.lane);
        } else {
          op.attempts += 1;
          await deps.store.putOp(op);
          emit();
          break;
        }
      }
    });
  }

  async function retry(id: string) {
    const op = ops.find((o) => o.id === id);
    if (!op || op.status !== "failed") return;
    op.status = "pending";
    op.error = undefined;
    op.attempts = 0;
    await deps.store.putOp(op);
    emit();
    await processAll();
  }

  /** Throws away a failed op and anything later in its lane that depended on it. */
  async function discard(id: string) {
    const op = ops.find((o) => o.id === id);
    if (!op) return;
    const doomed = ops.filter((o) => o.spec.lane === op.spec.lane && o.seq >= op.seq && o.status !== "synced");
    for (const d of doomed) await dropLocal(d);
  }

  return {
    init,
    reload: async () => {
      await init();
      await reload();
    },
    enqueue,
    processAll,
    retry,
    discard,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    onBackgroundSynced(l: () => void) {
      syncedListeners.add(l);
      return () => syncedListeners.delete(l);
    },
    getSnapshot: () => snapshot,
  };
}

export type Outbox = ReturnType<typeof createOutbox>;
