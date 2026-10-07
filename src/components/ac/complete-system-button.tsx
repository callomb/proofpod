"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { completeAcSystemAction } from "@/lib/ac/actions";
import { Button, Field, FormError, inputClass } from "../ui";
import { SignaturePad } from "./signature-pad";

async function uploadSignature(
  png: Blob,
  opts: { companyId: string; projectId: string; acSystemId: string },
): Promise<string> {
  const supabase = createClient();
  const path = `${opts.companyId}/${opts.projectId}/${opts.acSystemId}/${crypto.randomUUID()}.png`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, png, { contentType: "image/png", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

export function CompleteSystemButton({
  acSystemId,
  systemRef,
  companyId,
  projectId,
}: {
  acSystemId: string;
  systemRef: string;
  companyId: string;
  projectId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [signature, setSignature] = useState<Blob | null>(null);
  const [witnessed, setWitnessed] = useState(false);
  const [witnessName, setWitnessName] = useState("");
  const [witnessSignature, setWitnessSignature] = useState<Blob | null>(null);

  if (!confirming) {
    return (
      <Button size="lg" className="w-full" onClick={() => setConfirming(true)}>
        Complete system
      </Button>
    );
  }

  const ready =
    !!signature && (!witnessed || (witnessName.trim().length > 0 && !!witnessSignature));

  const confirm = async () => {
    if (!signature) return;
    setBusy(true);
    setError(null);
    try {
      const signaturePath = await uploadSignature(signature, { companyId, projectId, acSystemId });
      const witnessSignaturePath =
        witnessed && witnessSignature
          ? await uploadSignature(witnessSignature, { companyId, projectId, acSystemId })
          : null;
      const res = await completeAcSystemAction(acSystemId, {
        signaturePath,
        witnessName: witnessed ? witnessName.trim() : null,
        witnessSignaturePath,
      });
      if (res.error) throw new Error(res.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not complete the system");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-center text-[14px]">Confirm {systemRef} commissioning is complete.</p>

      <SignaturePad label="Engineer signature" onChange={setSignature} />

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Witnessed?</span>
        <div className="inline-flex rounded-full border border-line bg-paper p-0.5">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                setWitnessed(v);
                if (!v) setWitnessSignature(null);
              }}
              className={`rounded-full px-5 py-1.5 text-[13px] font-medium ${
                witnessed === v ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              {v ? "Yes" : "No"}
            </button>
          ))}
        </div>
      </div>

      {witnessed ? (
        <div className="space-y-4">
          <Field label="Witness name">
            <input
              value={witnessName}
              onChange={(e) => setWitnessName(e.target.value)}
              className={inputClass}
              autoComplete="off"
            />
          </Field>
          <SignaturePad label="Witness signature" onChange={setWitnessSignature} />
        </div>
      ) : null}

      <FormError>{error}</FormError>
      <div className="flex gap-3">
        <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => {
            setConfirming(false);
            setSignature(null);
            setWitnessSignature(null);
            setWitnessed(false);
            setWitnessName("");
          }}
        >
          Cancel
        </Button>
        <Button className="flex-1" disabled={busy || !ready} onClick={confirm}>
          {busy ? "Completing…" : "Confirm"}
        </Button>
      </div>
    </div>
  );
}
