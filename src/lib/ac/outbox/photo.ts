"use client";

import { outbox } from "./index";
import type { EnqueueResult, PhotoRecord } from "./types";

export const OFFLINE_MESSAGE = "No signal — this needs a connection. Try again when you're back online.";

/** Saves a photo on the phone and sends it (now if there's signal, otherwise when it returns). */
export function queuePhoto(
  file: File,
  opts: {
    companyId: string;
    projectId: string;
    folderId: string;
    lane: string;
    scope: string;
    record: Omit<PhotoRecord, "mime" | "sizeBytes">;
  },
): Promise<EnqueueResult & { path: string }> {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${opts.companyId}/${opts.projectId}/${opts.folderId}/${crypto.randomUUID()}.${ext}`;
  const contentType = file.type || "image/jpeg";
  return outbox
    .enqueue(
    {
      kind: "photo",
      lane: opts.lane,
      scope: opts.scope,
      path,
      contentType,
      record: { ...opts.record, mime: file.type, sizeBytes: file.size },
    },
    file,
  )
    .then((r) => ({ ...r, path }));
}
