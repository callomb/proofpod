"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import type { updateAcCommissioningAction } from "@/lib/ac/actions";
import { outbox } from "@/lib/ac/outbox";
import type { EnqueueResult } from "@/lib/ac/outbox/types";
import type { AcCommissioning, AcTemperatureReading, AcUnit } from "@/lib/ac/types";
import { Button, Card, FormError, Muted, inputClass } from "../ui";

function Checkbox({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2.5 text-[14px]">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-5 rounded border-line-strong"
      />
      {label}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="decimal"
        className={inputClass}
      />
    </label>
  );
}

export function CommissioningPanel({
  projectId,
  acSystemId,
  systemRef,
  commissioning,
  indoorUnits,
  temperatureReadings,
  memberNames,
}: {
  projectId: string;
  acSystemId: string;
  systemRef: string;
  commissioning: AcCommissioning;
  indoorUnits: AcUnit[];
  temperatureReadings: AcTemperatureReading[];
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [saveBusy, setSaveBusy] = useState(false);

  // Checkboxes save immediately (a click is a reliable, unambiguous commit) and
  // show as ticked straight away, even with no signal.
  const [checks, setChecks] = useState({
    transitBracketsRemoved: !!commissioning.transit_brackets_removed,
    electricalConnectionsTight: !!commissioning.electrical_connections_tight,
    localIsolatorFitted: !!commissioning.local_isolator_fitted,
    equipmentLabelled: !!commissioning.equipment_labelled,
    coversFixedClean: !!commissioning.covers_fixed_clean,
    functionalTestSatisfactory: !!commissioning.functional_test_satisfactory,
  });
  const saveCheck = async (key: keyof typeof checks, value: boolean) => {
    setError(null);
    setChecks((c) => ({ ...c, [key]: value }));
    const res = await outbox.enqueue({
      kind: "commissioning",
      lane: `comm:${acSystemId}`,
      scope: acSystemId,
      acSystemId,
      fields: { [key]: value },
    });
    if (res.status === "error") {
      setChecks((c) => ({ ...c, [key]: !value }));
      setError(res.error);
    }
  };

  // Everything else is typed then committed together with one explicit Save —
  // relying on onBlur alone lost data when a field was filled and the page
  // was left without that exact field losing focus first.
  const [form, setForm] = useState({
    mcb: commissioning.mcb_fuse_spec ?? "",
    flc: commissioning.outdoor_nameplate_flc_amps?.toString() ?? "",
    suction: commissioning.suction_pipe_size ?? "",
    liquid: commissioning.liquid_pipe_size ?? "",
    coolingL1: commissioning.current_cooling_l1?.toString() ?? "",
    coolingL2: commissioning.current_cooling_l2?.toString() ?? "",
    coolingL3: commissioning.current_cooling_l3?.toString() ?? "",
    heatingL1: commissioning.current_heating_l1?.toString() ?? "",
    heatingL2: commissioning.current_heating_l2?.toString() ?? "",
    heatingL3: commissioning.current_heating_l3?.toString() ?? "",
  });
  const set = (key: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [key]: v }));
  const num = (v: string) => (v ? Number(v) : undefined);

  const initialTemps = (): Record<string, TempValues> =>
    Object.fromEntries(
      indoorUnits.map((u) => {
        const c = temperatureReadings.find((r) => r.ac_unit_id === u.id && r.mode === "cooling");
        const h = temperatureReadings.find((r) => r.ac_unit_id === u.id && r.mode === "heating");
        return [
          u.id,
          {
            coolOn: c?.air_on_c?.toString() ?? "",
            coolOff: c?.air_off_c?.toString() ?? "",
            heatOn: h?.air_on_c?.toString() ?? "",
            heatOff: h?.air_off_c?.toString() ?? "",
          },
        ];
      }),
    );
  const [savedTemps] = useState(initialTemps);
  const [temps, setTemps] = useState(initialTemps);
  const setTemp = (unitId: string, key: keyof TempValues) => (v: string) =>
    setTemps((t) => ({ ...t, [unitId]: { ...t[unitId], [key]: v } }));

  // One Save for the whole page. Temperature readings are only sent when
  // changed, so re-saving doesn't re-stamp who/when for untouched readings.
  const [savedNote, setSavedNote] = useState<string | null>(null);
  const saveAll = async () => {
    setSaveBusy(true);
    setError(null);
    setSavedNote(null);
    const results: EnqueueResult[] = [];
    for (const u of indoorUnits) {
      const cur = temps[u.id];
      const was = savedTemps[u.id];
      if (cur.coolOn !== was.coolOn || cur.coolOff !== was.coolOff) {
        results.push(
          await outbox.enqueue({
            kind: "temperature",
            lane: `temp:${u.id}`,
            scope: acSystemId,
            input: { acUnitId: u.id, mode: "cooling", airOnC: num(cur.coolOn), airOffC: num(cur.coolOff) },
          }),
        );
      }
      if (cur.heatOn !== was.heatOn || cur.heatOff !== was.heatOff) {
        results.push(
          await outbox.enqueue({
            kind: "temperature",
            lane: `temp:${u.id}`,
            scope: acSystemId,
            input: { acUnitId: u.id, mode: "heating", airOnC: num(cur.heatOn), airOffC: num(cur.heatOff) },
          }),
        );
      }
    }
    results.push(
      await outbox.enqueue({
        kind: "commissioning",
        lane: `comm:${acSystemId}`,
        scope: acSystemId,
        acSystemId,
        fields: {
          mcbFuseSpec: form.mcb,
          outdoorNameplateFlcAmps: num(form.flc),
          suctionPipeSize: form.suction,
          liquidPipeSize: form.liquid,
          currentCoolingL1: num(form.coolingL1),
          currentCoolingL2: num(form.coolingL2),
          currentCoolingL3: num(form.coolingL3),
          currentHeatingL1: num(form.heatingL1),
          currentHeatingL2: num(form.heatingL2),
          currentHeatingL3: num(form.heatingL3),
        } satisfies Parameters<typeof updateAcCommissioningAction>[1],
      }),
    );
    setSaveBusy(false);

    const failed = results.find((r) => r.status === "error");
    if (failed && failed.status === "error") {
      setError(failed.error);
      return;
    }
    const queued = results.some((r) => r.status === "queued");
    if (queued && !navigator.onLine) {
      // The next screen can't load without signal, so stay here; it sends by itself.
      setSavedNote("Saved on this phone. It will send when signal returns — you can go back to the system then.");
      return;
    }
    router.push(`/projects/${projectId}/ac/${acSystemId}`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Installation checks</p>
        <div className="space-y-2.5">
          <Checkbox
            label="Transit brackets removed"
            checked={checks.transitBracketsRemoved}
            onChange={(v) => saveCheck("transitBracketsRemoved", v)}
          />
          <Checkbox
            label="Electrical / fly-lead connections tight"
            checked={checks.electricalConnectionsTight}
            onChange={(v) => saveCheck("electricalConnectionsTight", v)}
          />
          <Checkbox
            label="Local isolator fitted"
            checked={checks.localIsolatorFitted}
            onChange={(v) => saveCheck("localIsolatorFitted", v)}
          />
          <Checkbox
            label="Equipment labelled"
            checked={checks.equipmentLabelled}
            onChange={(v) => saveCheck("equipmentLabelled", v)}
          />
          <Checkbox
            label="Covers fixed and clean"
            checked={checks.coversFixedClean}
            onChange={(v) => saveCheck("coversFixedClean", v)}
          />
          <Checkbox
            label="Functional test satisfactory"
            checked={checks.functionalTestSatisfactory}
            onChange={(v) => saveCheck("functionalTestSatisfactory", v)}
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Electrical</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="MCB / fuse size & type" value={form.mcb} onChange={set("mcb")} />
          <NumField label="Outdoor nameplate FLC (A)" value={form.flc} onChange={set("flc")} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Pipework</p>
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Suction pipe size" value={form.suction} onChange={set("suction")} />
          <TextField label="Liquid pipe size" value={form.liquid} onChange={set("liquid")} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-1 text-[14px] font-semibold">Running current — Cooling</p>
        <Muted className="mb-3 block">Leave irrelevant phases blank</Muted>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="L1 (A)" value={form.coolingL1} onChange={set("coolingL1")} />
          <NumField label="L2 (A)" value={form.coolingL2} onChange={set("coolingL2")} />
          <NumField label="L3 (A)" value={form.coolingL3} onChange={set("coolingL3")} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-1 text-[14px] font-semibold">Running current — Heating</p>
        <Muted className="mb-3 block">Leave irrelevant phases blank</Muted>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="L1 (A)" value={form.heatingL1} onChange={set("heatingL1")} />
          <NumField label="L2 (A)" value={form.heatingL2} onChange={set("heatingL2")} />
          <NumField label="L3 (A)" value={form.heatingL3} onChange={set("heatingL3")} />
        </div>
      </Card>

      {indoorUnits.map((unit) => (
        <TemperatureCard
          key={unit.id}
          unit={unit}
          cooling={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "cooling")}
          heating={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "heating")}
          memberNames={memberNames}
          values={temps[unit.id]}
          onChange={(key) => setTemp(unit.id, key)}
        />
      ))}

      <FormError>{error}</FormError>
      {savedNote ? <p className="text-center text-[13px] font-medium text-progress">{savedNote}</p> : null}
      <Button size="lg" className="w-full" disabled={saveBusy} onClick={saveAll}>
        {saveBusy ? "Saving…" : `Save — back to ${systemRef}`}
      </Button>
    </div>
  );
}

interface TempValues {
  coolOn: string;
  coolOff: string;
  heatOn: string;
  heatOff: string;
}

function TemperatureCard({
  unit,
  cooling,
  heating,
  memberNames,
  values,
  onChange,
}: {
  unit: AcUnit;
  cooling?: AcTemperatureReading;
  heating?: AcTemperatureReading;
  memberNames: Record<string, string>;
  values: TempValues;
  onChange: (key: keyof TempValues) => (v: string) => void;
}) {
  const { coolOn, coolOff, heatOn, heatOff } = values;
  const coolingDelta = coolOn && coolOff ? (Number(coolOn) - Number(coolOff)).toFixed(1) : null;
  const heatingDelta = heatOn && heatOff ? (Number(heatOff) - Number(heatOn)).toFixed(1) : null;

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">
        {unit.reference || "Indoor unit"} — Temperatures
      </p>

      <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Cooling</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={coolOn} onChange={onChange("coolOn")} />
        <NumField label="Air off (°C)" value={coolOff} onChange={onChange("coolOff")} />
      </div>
      {coolingDelta !== null ? <Muted className="mt-1.5 block">Cooling ΔT: {coolingDelta}°C</Muted> : null}
      {cooling?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[cooling.recorded_by] ?? "Someone"} · {cooling.recorded_at ? new Date(cooling.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}

      <p className="mb-1.5 mt-4 text-[13px] font-medium text-ink-soft">Heating</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={heatOn} onChange={onChange("heatOn")} />
        <NumField label="Air off (°C)" value={heatOff} onChange={onChange("heatOff")} />
      </div>
      {heatingDelta !== null ? <Muted className="mt-1.5 block">Heating ΔT: {heatingDelta}°C</Muted> : null}
      {heating?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[heating.recorded_by] ?? "Someone"} · {heating.recorded_at ? new Date(heating.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}
    </Card>
  );
}
