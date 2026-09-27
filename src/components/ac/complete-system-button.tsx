"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { completeAcSystemAction } from "@/lib/ac/actions";
import { Button, FormError } from "../ui";

export function CompleteSystemButton({ acSystemId, systemRef }: { acSystemId: string; systemRef: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!confirming) {
    return (
      <Button size="lg" className="w-full" onClick={() => setConfirming(true)}>
        Complete system
      </Button>
    );
  }

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const res = await completeAcSystemAction(acSystemId);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  return (
    <div>
      <p className="mb-3 text-center text-[14px]">Confirm {systemRef} commissioning is complete.</p>
      <FormError>{error}</FormError>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => setConfirming(false)}>
          Cancel
        </Button>
        <Button className="flex-1" disabled={busy} onClick={confirm}>
          {busy ? "Completing…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
