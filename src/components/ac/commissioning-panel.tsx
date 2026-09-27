"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { updateAcCommissioningAction, upsertAcTemperatureReadingAction } from "@/lib/ac/actions";
import type { AcCommissioning, AcTemperatureReading, AcUnit } from "@/lib/ac/types";
import { Card, FormError, Muted, inputClass } from "../ui";

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

function NumField({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] text-muted">{label}</span>
      <input
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => onCommit(local)}
        inputMode="decimal"
        className={inputClass}
      />
    </label>
  );
}

export function CommissioningPanel({
  acSystemId,
  commissioning,
  indoorUnits,
  temperatureReadings,
  memberNames,
}: {
  acSystemId: string;
  commissioning: AcCommissioning;
  indoorUnits: AcUnit[];
  temperatureReadings: AcTemperatureReading[];
  memberNames: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  const save = async (fields: Fields) => {
    setError(null);
    const res = await updateAcCommissioningAction(acSystemId, fields);
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const [mcb, setMcb] = useState(commissioning.mcb_fuse_spec ?? "");
  const [flc, setFlc] = useState(commissioning.outdoor_nameplate_flc_amps?.toString() ?? "");
  const [suction, setSuction] = useState(commissioning.suction_pipe_size ?? "");
  const [liquid, setLiquid] = useState(commissioning.liquid_pipe_size ?? "");

  return (
    <div className="space-y-4">
      <FormError>{error}</FormError>
      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Installation checks</p>
        <div className="space-y-2.5">
          <Checkbox
            label="Transit brackets removed"
            checked={!!commissioning.transit_brackets_removed}
            onChange={(v) => save({ transitBracketsRemoved: v })}
          />
          <Checkbox
            label="Electrical / fly-lead connections tight"
            checked={!!commissioning.electrical_connections_tight}
            onChange={(v) => save({ electricalConnectionsTight: v })}
          />
          <Checkbox
            label="Local isolator fitted"
            checked={!!commissioning.local_isolator_fitted}
            onChange={(v) => save({ localIsolatorFitted: v })}
          />
          <Checkbox
            label="Equipment labelled"
            checked={!!commissioning.equipment_labelled}
            onChange={(v) => save({ equipmentLabelled: v })}
          />
          <Checkbox
            label="Covers fixed and clean"
            checked={!!commissioning.covers_fixed_clean}
            onChange={(v) => save({ coversFixedClean: v })}
          />
          <Checkbox
            label="Functional test satisfactory"
            checked={!!commissioning.functional_test_satisfactory}
            onChange={(v) => save({ functionalTestSatisfactory: v })}
          />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Electrical</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">MCB / fuse size &amp; type</span>
            <input value={mcb} onChange={(e) => setMcb(e.target.value)} onBlur={() => save({ mcbFuseSpec: mcb })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Outdoor nameplate FLC (A)</span>
            <input value={flc} onChange={(e) => setFlc(e.target.value)} onBlur={() => save({ outdoorNameplateFlcAmps: Number(flc) || undefined })} inputMode="decimal" className={inputClass} />
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-3 text-[14px] font-semibold">Pipework</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Suction pipe size</span>
            <input value={suction} onChange={(e) => setSuction(e.target.value)} onBlur={() => save({ suctionPipeSize: suction })} className={inputClass} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Liquid pipe size</span>
            <input value={liquid} onChange={(e) => setLiquid(e.target.value)} onBlur={() => save({ liquidPipeSize: liquid })} className={inputClass} />
          </label>
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-1 text-[14px] font-semibold">Running current — Cooling</p>
        <Muted className="mb-3 block">Leave irrelevant phases blank</Muted>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="L1 (A)" value={commissioning.current_cooling_l1?.toString() ?? ""} onCommit={(v) => save({ currentCoolingL1: v ? Number(v) : undefined })} />
          <NumField label="L2 (A)" value={commissioning.current_cooling_l2?.toString() ?? ""} onCommit={(v) => save({ currentCoolingL2: v ? Number(v) : undefined })} />
          <NumField label="L3 (A)" value={commissioning.current_cooling_l3?.toString() ?? ""} onCommit={(v) => save({ currentCoolingL3: v ? Number(v) : undefined })} />
        </div>
      </Card>

      <Card className="p-4">
        <p className="mb-1 text-[14px] font-semibold">Running current — Heating</p>
        <Muted className="mb-3 block">Leave irrelevant phases blank</Muted>
        <div className="grid grid-cols-3 gap-3">
          <NumField label="L1 (A)" value={commissioning.current_heating_l1?.toString() ?? ""} onCommit={(v) => save({ currentHeatingL1: v ? Number(v) : undefined })} />
          <NumField label="L2 (A)" value={commissioning.current_heating_l2?.toString() ?? ""} onCommit={(v) => save({ currentHeatingL2: v ? Number(v) : undefined })} />
          <NumField label="L3 (A)" value={commissioning.current_heating_l3?.toString() ?? ""} onCommit={(v) => save({ currentHeatingL3: v ? Number(v) : undefined })} />
        </div>
      </Card>

      {indoorUnits.map((unit) => (
        <TemperatureCard
          key={unit.id}
          unit={unit}
          cooling={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "cooling")}
          heating={temperatureReadings.find((r) => r.ac_unit_id === unit.id && r.mode === "heating")}
          memberNames={memberNames}
        />
      ))}
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

  const save = async (mode: "cooling" | "heating", airOnC?: number, airOffC?: number) => {
    setError(null);
    const res = await upsertAcTemperatureReadingAction({ acUnitId: unit.id, mode, airOnC, airOffC });
    if (res.error) setError(res.error);
    else router.refresh();
  };

  const [coolOn, setCoolOn] = useState(cooling?.air_on_c?.toString() ?? "");
  const [coolOff, setCoolOff] = useState(cooling?.air_off_c?.toString() ?? "");
  const [heatOn, setHeatOn] = useState(heating?.air_on_c?.toString() ?? "");
  const [heatOff, setHeatOff] = useState(heating?.air_off_c?.toString() ?? "");

  const coolingDelta = coolOn && coolOff ? (Number(coolOn) - Number(coolOff)).toFixed(1) : null;
  const heatingDelta = heatOn && heatOff ? (Number(heatOff) - Number(heatOn)).toFixed(1) : null;

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">
        {unit.reference || "Indoor unit"} — Temperatures
      </p>
      <FormError>{error}</FormError>

      <p className="mb-1.5 text-[13px] font-medium text-ink-soft">Cooling</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={coolOn} onCommit={(v) => { setCoolOn(v); save("cooling", v ? Number(v) : undefined, coolOff ? Number(coolOff) : undefined); }} />
        <NumField label="Air off (°C)" value={coolOff} onCommit={(v) => { setCoolOff(v); save("cooling", coolOn ? Number(coolOn) : undefined, v ? Number(v) : undefined); }} />
      </div>
      {coolingDelta !== null ? <Muted className="mt-1.5 block">Cooling ΔT: {coolingDelta}°C</Muted> : null}
      {cooling?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[cooling.recorded_by] ?? "Someone"} · {cooling.recorded_at ? new Date(cooling.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}

      <p className="mb-1.5 mt-4 text-[13px] font-medium text-ink-soft">Heating</p>
      <div className="grid grid-cols-2 gap-3">
        <NumField label="Air on (°C)" value={heatOn} onCommit={(v) => { setHeatOn(v); save("heating", v ? Number(v) : undefined, heatOff ? Number(heatOff) : undefined); }} />
        <NumField label="Air off (°C)" value={heatOff} onCommit={(v) => { setHeatOff(v); save("heating", heatOn ? Number(heatOn) : undefined, v ? Number(v) : undefined); }} />
      </div>
      {heatingDelta !== null ? <Muted className="mt-1.5 block">Heating ΔT: {heatingDelta}°C</Muted> : null}
      {heating?.recorded_by ? (
        <Muted className="mt-0.5 block">{memberNames[heating.recorded_by] ?? "Someone"} · {heating.recorded_at ? new Date(heating.recorded_at).toLocaleDateString("en-GB") : ""}</Muted>
      ) : null}
    </Card>
  );
}
