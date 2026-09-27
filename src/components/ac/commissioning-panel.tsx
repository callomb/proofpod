"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateAcCommissioningAction, upsertAcTemperatureReadingAction } from "@/lib/ac/actions";
import type { AcCommissioning, AcTemperatureReading, AcUnit } from "@/lib/ac/types";
import { Button, Card, FormError, Muted, inputClass } from "../ui";

type Fields = Parameters<typeof updateAcCommissioningAction>[1];

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

  // Checkboxes save immediately (a click is a reliable, unambiguous commit).
  const saveCheck = async (fields: Fields) => {
    setError(null);
    const res = await updateAcCommissioningAction(acSystemId, fields);
    if (res.error) setError(res.error);
    else router.refresh();
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

  const saveDetails = async (thenNavigate: boolean) => {
    setSaveBusy(true);
    setError(null);
    const res = await updateAcCommissioningAction(acSystemId, {
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
    });
    setSaveBusy(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    if (thenNavigate) router.push(`/projects/${projectId}/ac/${acSystemId}`);
    else router.refresh();
  };

  return (
    <div className="space-y-4">
      <FormError>{error}</FormError>
      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Installation checks</p>
        <div className="space-y-2.5">
          <Checkbox
            label="Transit brackets removed"
            checked={!!commissioning.transit_brackets_removed}
            onChange={(v) => saveCheck({ transitBracketsRemoved: v })}
          />
          <Checkbox
            label="Electrical / fly-lead connections tight"
            checked={!!commissioning.electrical_connections_tight}
            onChange={(v) => saveCheck({ electricalConnectionsTight: v })}
          />
          <Checkbox
            label="Local isolator fitted"
            checked={!!commissioning.local_isolator_fitted}
            onChange={(v) => saveCheck({ localIsolatorFitted: v })}
          />
          <Checkbox
            label="Equipment labelled"
            checked={!!commissioning.equipment_labelled}
            onChange={(v) => saveCheck({ equipmentLabelled: v })}
          />
          <Checkbox
            label="Covers fixed and clean"
            checked={!!commissioning.covers_fixed_clean}
            onChange={(v) => saveCheck({ coversFixedClean: v })}
          />
          <Checkbox
            label="Functional test satisfactory"
            checked={!!commissioning.functional_test_satisfactory}
            onChange={(v) => saveCheck({ functionalTestSatisfactory: v })}
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

      <Button size="lg" className="w-full" disabled={saveBusy} onClick={() => saveDetails(false)}>
        {saveBusy ? "Saving…" : "Save electrical, pipework & currents"}
      </Button>

      {indoorUnits.map((unit) => (
        <TemperatureCard
          key={unit.id}
          unit={unit}
          cooling={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "cooling")}
          heating={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "heating")}
          memberNames={memberNames}
        />
      ))}

      <Button
        size="lg"
        variant="secondary"
        className="w-full"
        disabled={saveBusy}
        onClick={() => saveDetails(true)}
      >
        Done — back to {systemRef}
      </Button>
    </div>
  );
}

function TemperatureCard({
  unit,
  cooling,
  heating,
  memberNames,
}: {
  unit: AcUnit;
  cooling?: AcTemperatureReading;
  heating?: AcTemperatureReading;
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [coolOn, setCoolOn] = useState(cooling?.air_on_c?.toString() ?? "");
  const [coolOff, setCoolOff] = useState(cooling?.air_off_c?.toString() ?? "");
  const [heatOn, setHeatOn] = useState(heating?.air_on_c?.toString() ?? "");
  const [heatOff, setHeatOff] = useState(heating?.air_off_c?.toString() ?? "");

  const coolingDelta = coolOn && coolOff ? (Number(coolOn) - Number(coolOff)).toFixed(1) : null;
  const heatingDelta = heatOn && heatOff ? (Number(heatOff) - Number(heatOn)).toFixed(1) : null;

  const save = async () => {
    setBusy(true);
    setError(null);
    const results = await Promise.all([
      upsertAcTemperatureReadingAction({
        acUnitId: unit.id,
        mode: "cooling",
        airOnC: coolOn ? Number(coolOn) : undefined,
        airOffC: coolOff ? Number(coolOff) : undefined,
      }),
      upsertAcTemperatureReadingAction({
        acUnitId: unit.id,
        mode: "heating",
        airOnC: heatOn ? Number(heatOn) : undefined,
        airOffC: heatOff ? Number(heatOff) : undefined,
      }),
    ]);
    setBusy(false);
    const failed = results.find((r) => r.error);
    if (failed) setError(failed.error!);
    else router.refresh();
  };

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">
        {unit.reference || "Indoor unit"} — Temperatures
      </p>
      <FormError>{error}</FormError>

      <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Cooling</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={coolOn} onChange={setCoolOn} />
        <NumField label="Air off (°C)" value={coolOff} onChange={setCoolOff} />
      </div>
      {coolingDelta !== null ? <Muted className="mt-1.5 block">Cooling ΔT: {coolingDelta}°C</Muted> : null}
      {cooling?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[cooling.recorded_by] ?? "Someone"} · {cooling.recorded_at ? new Date(cooling.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}

      <p className="mb-1.5 mt-4 text-[13px] font-medium text-ink-soft">Heating</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={heatOn} onChange={setHeatOn} />
        <NumField label="Air off (°C)" value={heatOff} onChange={setHeatOff} />
      </div>
      {heatingDelta !== null ? <Muted className="mt-1.5 block">Heating ΔT: {heatingDelta}°C</Muted> : null}
      {heating?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[heating.recorded_by] ?? "Someone"} · {heating.recorded_at ? new Date(heating.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}

      <Button size="sm" variant="secondary" className="mt-4" disabled={busy} onClick={save}>
        {busy ? "Saving…" : "Save temperatures"}
      </Button>
    </Card>
  );
}
