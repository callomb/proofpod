"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createAcDrainTestAction } from "@/lib/ac/actions";
import type { AcDrainTest, AcUnit } from "@/lib/ac/types";
import { Button, Card, FormError, StatusDot, inputClass } from "../ui";

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function UnitDrainTest({
  unit,
  latest,
  memberNames,
}: {
  unit: AcUnit;
  latest?: AcDrainTest;
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [drainType, setDrainType] = useState<"pump" | "gravity">("pump");
  const [pumpModel, setPumpModel] = useState("");
  const [waterAdded, setWaterAdded] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(!latest);

  const submit = async (result: "passed" | "failed") => {
    setBusy(true);
    setError(null);
    const res = await createAcDrainTestAction({
      acUnitId: unit.id,
      drainType,
      result,
      pumpModel: drainType === "pump" ? pumpModel : null,
      waterAddedLitres: waterAdded ? Number(waterAdded) : null,
      notes: notes || null,
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else {
      setShowForm(false);
      router.refresh();
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">{unit.reference || "Indoor unit"} — Drain test</p>

      {latest ? (
        <div className="mb-3 flex items-center justify-between rounded-xl bg-canvas p-3">
          <div>
            <span className="inline-flex items-center gap-1.5 text-[13px] font-medium">
              <StatusDot tone={latest.result === "passed" ? "pass" : "fail"} />
              {latest.result === "passed" ? "Passed" : "Failed"}
            </span>
            <p className="mt-0.5 text-[12px] text-muted">
              {latest.drain_type === "pump" ? `Pump${latest.pump_model ? ` · ${latest.pump_model}` : ""}` : "Gravity"}
              {latest.water_added_litres ? ` · ${latest.water_added_litres} L` : ""} ·{" "}
              {memberNames[latest.tested_by] ?? "Someone"} · {fmtDateTime(latest.tested_at)}
            </p>
          </div>
          {!showForm ? (
            <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(true)}>
              Retest
            </Button>
          ) : null}
        </div>
      ) : null}

      {showForm ? (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2">
            {(["pump", "gravity"] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-xl border px-3 py-2.5 text-center text-[14px] font-medium capitalize ${
                  drainType === t ? "border-ink bg-ink text-paper" : "border-line-strong bg-paper text-ink-soft"
                }`}
              >
                <input type="radio" checked={drainType === t} onChange={() => setDrainType(t)} className="sr-only" />
                {t}
              </label>
            ))}
          </div>

          {drainType === "pump" ? (
            <label className="mb-3 block">
              <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Pump model / make</span>
              <input value={pumpModel} onChange={(e) => setPumpModel(e.target.value)} className={inputClass} />
            </label>
          ) : null}

          <label className="mb-3 block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Test water added (litres)</span>
            <input value={waterAdded} onChange={(e) => setWaterAdded(e.target.value)} inputMode="decimal" className={inputClass} />
          </label>
          <label className="mb-3 block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Notes (optional)</span>
            <input value={notes} onChange={(e) => setNotes(e.target.value)} className={inputClass} />
          </label>

          <FormError>{error}</FormError>
          <div className="flex gap-3">
            <Button variant="secondary" className="flex-1" disabled={busy} onClick={() => submit("failed")}>
              Fail
            </Button>
            <Button className="flex-1" disabled={busy} onClick={() => submit("passed")}>
              Pass
            </Button>
          </div>
        </>
      ) : null}
    </Card>
  );
}

export function DrainTestPanel({
  units,
  drainTests,
  memberNames,
}: {
  units: AcUnit[];
  drainTests: AcDrainTest[];
  memberNames: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      {units.map((unit) => (
        <UnitDrainTest
          key={unit.id}
          unit={unit}
          latest={drainTests.find((d) => d.ac_unit_id === unit.id)}
          memberNames={memberNames}
        />
      ))}
    </div>
  );
}
