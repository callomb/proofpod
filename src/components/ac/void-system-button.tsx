"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { voidAcSystemAction } from "@/lib/ac/actions";
import { Button, FormError } from "../ui";

export function VoidSystemButton({ acSystemId, systemRef }: { acSystemId: string; systemRef: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="text-[12px] font-medium text-fail hover:underline"
      >
        Void system
      </button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await voidAcSystemAction(acSystemId, reason || undefined);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  return (
    <div className="rounded-2xl border border-fail/30 bg-fail-soft p-4">
      <p className="mb-2 text-[13px] font-semibold text-fail">Void {systemRef}?</p>
      <p className="mb-3 text-[12px] text-muted">
        Nothing is deleted — the record stays, marked void, for reference.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional)"
        className="mb-3 w-full rounded-xl border border-line-strong bg-paper px-3.5 py-2.5 text-[14px]"
      />
      <FormError>{error}</FormError>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button variant="danger" size="sm" disabled={busy} onClick={confirm}>
          {busy ? "Voiding…" : "Void"}
        </Button>
      </div>
    </div>
  );
}
