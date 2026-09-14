"use client";

import { useState } from "react";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate font-mono text-[15px]">{value}</p>
      </div>
      <button
        type="button"
        className="shrink-0 rounded-full border border-line-strong px-3 py-1.5 text-[12px] font-semibold hover:bg-paper"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          } catch {
            /* clipboard blocked */
          }
        }}
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

export function CredentialsPanel({
  username,
  password,
  note,
}: {
  username?: string;
  password: string;
  note?: string;
}) {
  return (
    <div className="space-y-3">
      <p className="rounded-xl bg-progress-soft px-3.5 py-2.5 text-[13px] text-progress">
        {note ?? "Save this now — the password won't be shown again. Pass it to them directly."}
      </p>
      {username ? <CopyRow label="Username" value={username} /> : null}
      <CopyRow label="Password" value={password} />
    </div>
  );
}
