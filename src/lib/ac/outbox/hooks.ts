"use client";

import { useSyncExternalStore } from "react";

import { outbox } from "./index";
import type { OpSpec, OutboxOp } from "./types";

const EMPTY: OutboxOp[] = [];

export function useOutboxOps(): OutboxOp[] {
  return useSyncExternalStore(outbox.subscribe, outbox.getSnapshot, () => EMPTY);
}

const subscribeOnline = (cb: () => void) => {
  window.addEventListener("online", cb);
  window.addEventListener("offline", cb);
  return () => {
    window.removeEventListener("online", cb);
    window.removeEventListener("offline", cb);
  };
};

export function useOnline(): boolean {
  return useSyncExternalStore(
    subscribeOnline,
    () => navigator.onLine,
    () => true,
  );
}

/** Ops that still need sending (waiting or failed), optionally for one system. */
export function waitingOps(ops: OutboxOp[], scope?: string): OutboxOp[] {
  return ops.filter((o) => (o.status === "pending" || o.status === "failed") && (!scope || o.spec.scope === scope));
}

/** Ops that count as already done in the UI: still waiting, or just sent and the page is refreshing. */
export function appliedOps<K extends OpSpec["kind"]>(ops: OutboxOp[], kind: K): (OutboxOp & { spec: Extract<OpSpec, { kind: K }> })[] {
  return ops.filter((o) => o.spec.kind === kind) as (OutboxOp & { spec: Extract<OpSpec, { kind: K }> })[];
}
