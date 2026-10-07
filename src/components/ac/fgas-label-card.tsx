"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { requestAcFgasLabelAction, retryAcFgasLabelAction } from "@/lib/ac/fgas-actions";
import type { AcFgasLabelRequest } from "@/lib/ac/types";
import { Button, Card, FormError, Muted, StatusDot } from "../ui";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export function FgasLabelCard({
  acSystemId,
  request,
}: {
  acSystemId: string;
  request: AcFgasLabelRequest | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (fn: () => Promise<{ ok?: boolean; error?: string }>) => {
    setBusy(true);
    setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error);
    router.refresh();
  };

  if (request?.status === "sent") {
    return (
      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-[14px] font-medium">F-Gas label</p>
          <p className="mt-0.5 text-[12px] text-muted">
            Sent to Tagref{request.sent_at ? ` · ${fmtDate(request.sent_at)}` : ""}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <StatusDot tone="pass" />
          Requested
        </span>
      </Card>
    );
  }

  if (request) {
    const message = error ?? request.last_error;
    return (
      <Card className="p-4">
        <p className="text-[14px] font-medium">F-Gas label</p>
        <Muted className="mt-0.5 block">
          Requested, but not delivered to Tagref yet. Your request is saved — nothing is lost.
        </Muted>
        <div className="mt-3">
          <FormError>{message}</FormError>
        </div>
        <Button
          className="mt-3 w-full"
          disabled={busy}
          onClick={() => run(() => retryAcFgasLabelAction(request.id))}
        >
          {busy ? "Sending…" : "Retry sending to Tagref"}
        </Button>
      </Card>
    );
  }

  return (
    <Card className="p-4">
      <p className="text-[14px] font-medium">F-Gas label</p>
      <Muted className="mt-0.5 block">Sends this system&apos;s final refrigerant details to Tagref to produce the label.</Muted>
      <div className="mt-3">
        <FormError>{error}</FormError>
      </div>
      <Button
        className="mt-3 w-full"
        disabled={busy}
        onClick={() => run(() => requestAcFgasLabelAction(acSystemId))}
      >
        {busy ? "Sending…" : "Request F-Gas label"}
      </Button>
    </Card>
  );
}
