"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  completeAcEvacuationAction,
  recordAcPhotoAction,
  saveAcEvacuationChecklistAction,
  updateAcChargeAction,
  upsertAcChargeCalcLineAction,
} from "@/lib/ac/actions";
import { EVACUATION_CHECKLIST_ITEMS, PIPE_SIZES, chargeRateFor } from "@/lib/ac/domain";
import type { AcCharge, AcChargeCalcLine, AcChargeRate, AcEvacuation, AcSystem } from "@/lib/ac/types";
import { Button, Card, FormError, Muted, StatusDot, inputClass } from "../ui";

async function uploadEvidence(
  file: File,
  opts: { companyId: string; projectId: string; acSystemId: string },
): Promise<string> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${opts.companyId}/${opts.projectId}/${opts.acSystemId}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return path;
}

function EvacuationSection({
  system,
  evacuation,
  hasFinalPhoto,
}: {
  system: AcSystem;
  evacuation: AcEvacuation;
  hasFinalPhoto: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [checklist, setChecklist] = useState<Record<string, boolean>>(evacuation.checklist ?? {});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async (key: string) => {
    const prev = checklist;
    const next = { ...checklist, [key]: !checklist[key] };
    setChecklist(next);
    setError(null);
    const res = await saveAcEvacuationChecklistAction(system.id, { [key]: next[key] });
    if (res.error) {
      setChecklist(prev);
      setError(res.error);
    }
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const path = await uploadEvidence(file, {
        companyId: system.company_id,
        projectId: system.project_id,
        acSystemId: system.id,
      });
      const rec = await recordAcPhotoAction({
        acSystemId: system.id,
        storagePath: path,
        subject: "evacuation_final",
        mime: file.type,
        sizeBytes: file.size,
      });
      if (rec.error) throw new Error(rec.error);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    setError(null);
    const res = await completeAcEvacuationAction(system.id);
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[14px] font-semibold">Evacuation</p>
        {evacuation.completed_at ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-medium">
            <StatusDot tone="pass" />
            Complete
          </span>
        ) : null}
      </div>

      <div className="space-y-2.5">
        {EVACUATION_CHECKLIST_ITEMS.map((item) => (
          <label key={item.key} className="flex items-center gap-2.5 text-[14px]">
            <input
              type="checkbox"
              checked={!!checklist[item.key]}
              onChange={() => toggle(item.key)}
              disabled={!!evacuation.completed_at}
              className="size-5 rounded border-line-strong"
            />
            {item.label}
          </label>
        ))}
      </div>

      <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFile} />
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="mt-4"
        disabled={busy || !!evacuation.completed_at}
        onClick={() => fileRef.current?.click()}
      >
        {hasFinalPhoto ? "Retake final photo" : "Photograph final evacuation evidence"}
      </Button>
      {hasFinalPhoto ? (
        <p className="mt-1.5 text-[12px] text-muted">Final photo saved.</p>
      ) : (
        <p className="mt-1.5 text-[12px] text-muted">Required before evacuation can be marked complete.</p>
      )}

      <FormError>{error}</FormError>

      {!evacuation.completed_at ? (
        <Button size="lg" className="mt-4 w-full" disabled={busy || !hasFinalPhoto} onClick={complete}>
          Mark evacuation complete
        </Button>
      ) : null}
    </Card>
  );
}

function ChargeSection({
  system,
  charge,
  calcLines,
  rates,
}: {
  system: AcSystem;
  charge: AcCharge;
  calcLines: AcChargeCalcLine[];
  rates: AcChargeRate[];
}) {
  const router = useRouter();
  const [factory, setFactory] = useState(charge.factory_charge_kg?.toString() ?? "");
  const [allowance, setAllowance] = useState(charge.factory_pipe_allowance_m?.toString() ?? "");
  const [installed, setInstalled] = useState(charge.installed_pipe_length_m?.toString() ?? "");
  const [actualAdditional, setActualAdditional] = useState(charge.actual_additional_kg?.toString() ?? "");
  const [showCalculator, setShowCalculator] = useState(false);
  const [lines, setLines] = useState<Record<string, { length: string; rate: string; overridden: boolean }>>(
    () =>
      Object.fromEntries(
        PIPE_SIZES.map((size) => {
          const existing = calcLines.find((l) => l.pipe_size === size);
          const defaultRate = chargeRateFor(rates, size, system.manufacturer, system.refrigerant_code);
          return [
            size,
            {
              length: existing?.length_m ? String(existing.length_m) : "",
              rate: existing?.rate_kg_per_m != null ? String(existing.rate_kg_per_m) : defaultRate != null ? String(defaultRate) : "",
              overridden: existing?.overridden ?? false,
            },
          ];
        }),
      ),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const diff =
    installed && allowance ? (Number(installed) - Number(allowance)).toFixed(2) : null;

  const calculatorTotal = Object.values(lines).reduce(
    (sum, l) => sum + (Number(l.length) || 0) * (Number(l.rate) || 0),
    0,
  );

  const saveField = async (overrides: Partial<Parameters<typeof updateAcChargeAction>[0]> = {}) => {
    setBusy(true);
    setError(null);
    const res = await updateAcChargeAction({
      acSystemId: system.id,
      factoryChargeKg: factory ? Number(factory) : null,
      factoryPipeAllowanceM: allowance ? Number(allowance) : null,
      installedPipeLengthM: installed ? Number(installed) : null,
      actualAdditionalKg: actualAdditional ? Number(actualAdditional) : null,
      ...overrides,
    });
    setBusy(false);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const saveLine = async (pipeSize: string, next: { length: string; rate: string; overridden: boolean }) => {
    const res = await upsertAcChargeCalcLineAction({
      acSystemId: system.id,
      pipeSize,
      lengthM: Number(next.length) || 0,
      rateKgPerM: next.rate ? Number(next.rate) : null,
      overridden: next.overridden,
    });
    if (res.error) setError(res.error);
  };

  const useCalculatedTotal = () => {
    setActualAdditional(calculatorTotal.toFixed(2));
    saveField({ additionalMethod: "calculated", actualAdditionalKg: calculatorTotal });
  };

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">Refrigerant charge</p>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Factory charge (kg)</span>
          <input value={factory} onChange={(e) => setFactory(e.target.value)} onBlur={() => saveField()} inputMode="decimal" className={inputClass} />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Pipe allowance (m)</span>
          <input value={allowance} onChange={(e) => setAllowance(e.target.value)} onBlur={() => saveField()} inputMode="decimal" className={inputClass} />
        </label>
      </div>
      <label className="mt-3 block">
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Actual installed pipe length (m)</span>
        <input value={installed} onChange={(e) => setInstalled(e.target.value)} onBlur={() => saveField()} inputMode="decimal" className={inputClass} />
      </label>
      {diff !== null ? <Muted className="mt-1.5 block">Difference from allowance: {diff} m</Muted> : null}

      <div className="mt-5 border-t border-line pt-4">
        <label className="block">
          <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
            Actual additional refrigerant added (kg)
          </span>
          <input
            value={actualAdditional}
            onChange={(e) => setActualAdditional(e.target.value)}
            onBlur={() => saveField({ additionalMethod: "manual" })}
            inputMode="decimal"
            className={inputClass}
            placeholder="e.g. 2.00"
          />
        </label>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="mt-2"
          onClick={() => setShowCalculator((s) => !s)}
        >
          {showCalculator ? "Hide calculator" : "Calculate additional charge"}
        </Button>

        {showCalculator ? (
          <div className="mt-3 space-y-2">
            {PIPE_SIZES.map((size) => {
              const line = lines[size];
              return (
                <div key={size} className="grid grid-cols-[1fr_1fr_1fr] items-end gap-2">
                  <span className="pb-2.5 text-[13px]">{size}</span>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">Length (m)</span>
                    <input
                      value={line.length}
                      onChange={(e) => setLines((s) => ({ ...s, [size]: { ...s[size], length: e.target.value } }))}
                      onBlur={() => saveLine(size, lines[size])}
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-[11px] text-muted">kg/m{line.overridden ? " · manual" : ""}</span>
                    <input
                      value={line.rate}
                      onChange={(e) =>
                        setLines((s) => ({ ...s, [size]: { ...s[size], rate: e.target.value, overridden: true } }))
                      }
                      onBlur={() => saveLine(size, lines[size])}
                      inputMode="decimal"
                      className={inputClass}
                    />
                  </label>
                </div>
              );
            })}
            <div className="flex items-center justify-between pt-2">
              <Muted>Calculated total: {calculatorTotal.toFixed(2)} kg</Muted>
              <Button type="button" variant="secondary" size="sm" disabled={busy} onClick={useCalculatedTotal}>
                Use as actual added
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 rounded-xl bg-canvas p-3.5">
        <p className="text-[13px] text-muted">Total system charge</p>
        <p className="text-[20px] font-semibold">{charge.total_charge_kg.toFixed(2)} kg</p>
      </div>

      <FormError>{error}</FormError>
      <Button size="lg" className="mt-4 w-full" disabled={busy} onClick={() => saveField()}>
        {busy ? "Saving…" : "Save charge details"}
      </Button>
    </Card>
  );
}

export function EvacuationChargePanel({
  system,
  evacuation,
  charge,
  calcLines,
  rates,
  hasFinalPhoto,
}: {
  system: AcSystem;
  evacuation: AcEvacuation;
  charge: AcCharge;
  calcLines: AcChargeCalcLine[];
  rates: AcChargeRate[];
  hasFinalPhoto: boolean;
}) {
  return (
    <div className="space-y-4">
      <EvacuationSection system={system} evacuation={evacuation} hasFinalPhoto={hasFinalPhoto} />
      <ChargeSection system={system} charge={charge} calcLines={calcLines} rates={rates} />
    </div>
  );
}
