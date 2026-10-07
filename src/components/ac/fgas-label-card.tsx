"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { requestAcFgasLabelAction } from "@/lib/ac/fgas-actions";
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

  if (request) {
    const produced = request.status === "produced";
    return (
      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-[14px] font-medium">F-Gas label</p>
          <p className="mt-0.5 text-[12px] text-muted">
            {produced && request.produced_at
              ? `Produced · ${fmtDate(request.produced_at)}`
              : `Requested · ${fmtDate(request.requested_at)}`}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
          <StatusDot tone={produced ? "pass" : "progress"} />
          {produced ? "Produced" : "Requested"}
        </span>
      </Card>
    );
  }

  const request_ = async () => {
    setBusy(true);
    setError(null);
    const res = await requestAcFgasLabelAction(acSystemId);
    setBusy(false);
    if (res.error) setError(res.error);
    router.refresh();
  };

  return (
    <Card className="p-4">
      <p className="text-[14px] font-medium">F-Gas label</p>
      <Muted className="mt-0.5 block">
        Requests an F-Gas label from Tagref using this system&apos;s final refrigerant details.
      </Muted>
      <div className="mt-3">
        <FormError>{error}</FormError>
      </div>
      <Button className="mt-3 w-full" disabled={busy} onClick={request_}>
        {busy ? "Requesting…" : "Request F-Gas label"}
      </Button>
    </Card>
  );
}
