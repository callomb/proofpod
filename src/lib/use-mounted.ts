"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/**
 * `false` during SSR and the first client render, `true` afterwards.
 * Use to gate rendering of values that differ between server and client
 * (local time/locale formatting) without tripping hydration.
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}
