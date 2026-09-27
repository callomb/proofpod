"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createAcPressureTestAttemptAction } from "@/lib/ac/actions";
import { Button, Field, FormError, inputClass } from "../ui";

export function NewStandaloneAcPressureTestForm({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!reference.trim()) {
      setError("Enter what's being tested.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await createAcPressureTestAttemptAction({ projectId, reference });
    setBusy(false);
    if (res.error || !res.lineageId) {
      setError(res.error ?? "Couldn't create the test.");
      return;
    }
    router.push(`/projects/${projectId}/ac/pressure-tests/${res.lineageId}`);
  };

  return (
    <div className="space-y-5">
      <Field label="Reference / what's being tested" required hint="e.g. Riser cupboard pipework, Plant room pipework">
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          className={inputClass}
          placeholder="Riser cupboard pipework"
          autoFocus
        />
      </Field>
      <FormError>{error}</FormError>
      <Button size="lg" className="w-full" disabled={busy} onClick={submit}>
        {busy ? "Creating…" : "Continue"}
      </Button>
    </div>
  );
}
