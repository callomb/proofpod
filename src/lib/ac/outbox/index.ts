"use client";

import { createOutbox } from "./core";
import { executeOp } from "./execute";
import * as store from "./store";

let channel: BroadcastChannel | null = null;

export const outbox = createOutbox({
  store,
  execute: executeOp,
  withLock: async <T,>(fn: () => Promise<T>): Promise<T> => {
    const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
    return locks ? await locks.request("proofpod-outbox", () => fn()) : await fn();
  },
  now: () => new Date(),
  uuid: () => crypto.randomUUID(),
  notifyOthers: () => channel?.postMessage("changed"),
});

let started = false;

/** Starts the background sender (call once, from the app shell). */
export function startOutbox() {
  if (started || typeof window === "undefined") return;
  started = true;

  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel("proofpod-outbox");
    channel.onmessage = () => void outbox.reload();
  }
  window.addEventListener("online", () => void outbox.processAll());
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") void outbox.processAll();
  });
  setInterval(() => {
    if (outbox.getSnapshot().some((o) => o.status === "pending")) void outbox.processAll();
  }, 15_000);

  void outbox.init().then(() => outbox.processAll());
}
