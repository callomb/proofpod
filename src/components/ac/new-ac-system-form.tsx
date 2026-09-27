"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";

import { createAcSystemAction, type ActionResult } from "@/lib/ac/actions";
import { MANUFACTURER_OPTIONS, REFRIGERANT_OPTIONS, gwpForRefrigerant } from "@/lib/ac/domain";
import { Button, Field, FormError, inputClass } from "../ui";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" className="w-full" disabled={pending}>
      {pending ? "Creating…" : "Create system"}
    </Button>
  );
}

export function NewAcSystemForm({
  projectId,
  redirectBase = "/projects",
}: {
  projectId: string;
  redirectBase?: string;
}) {
  const [state, action] = useActionState<ActionResult, FormData>(createAcSystemAction, {});
  const [manufacturer, setManufacturer] = useState<string>(MANUFACTURER_OPTIONS[0]);
  const [refrigerantCode, setRefrigerantCode] = useState<string>(REFRIGERANT_OPTIONS[0].code);
  const [manualGwp, setManualGwp] = useState("");
  const [clientError, setClientError] = useState<string | null>(null);

  const gwp = gwpForRefrigerant(refrigerantCode);

  return (
    <form
      action={action}
      onSubmit={(e) => {
        const fd = new FormData(e.currentTarget);
        if (!String(fd.get("system_ref") ?? "").trim()) {
          e.preventDefault();
          setClientError("Enter a system reference.");
          return;
        }
        if (!String(fd.get("area_served") ?? "").trim()) {
          e.preventDefault();
          setClientError("Enter the area served.");
          return;
        }
        if (!String(fd.get("outdoor_location") ?? "").trim()) {
          e.preventDefault();
          setClientError("Enter the outdoor unit location.");
          return;
        }
        setClientError(null);
      }}
      className="space-y-5"
    >
      <input type="hidden" name="project_id" value={projectId} />
      <input type="hidden" name="redirect_base" value={redirectBase} />
      <input type="hidden" name="gwp" value={gwp ?? manualGwp} />

      <Field label="System reference" required hint="e.g. SPLIT-01, AC-01, AC/GF/01">
        <input name="system_ref" required className={inputClass} placeholder="SPLIT-01" autoFocus />
      </Field>

      <Field label="Area served" required hint="e.g. Meeting Room 01, Server Room">
        <input name="area_served" required className={inputClass} placeholder="Meeting Room 01" />
      </Field>

      <Field label="Outdoor unit location" required hint="e.g. Roof, Plant Deck, Rear Elevation">
        <input name="outdoor_location" required className={inputClass} placeholder="Roof" />
      </Field>

      <Field label="Manufacturer">
        <select
          name="manufacturer"
          value={manufacturer}
          onChange={(e) => setManufacturer(e.target.value)}
          className={inputClass}
        >
          {MANUFACTURER_OPTIONS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
      </Field>
      {manufacturer === "Other" ? (
        <Field label="Manufacturer name" required>
          <input name="manufacturer_other" className={inputClass} placeholder="Manufacturer" />
        </Field>
      ) : null}

      <Field label="Refrigerant">
        <select
          name="refrigerant_code"
          value={refrigerantCode}
          onChange={(e) => setRefrigerantCode(e.target.value)}
          className={inputClass}
        >
          {REFRIGERANT_OPTIONS.map((r) => (
            <option key={r.code} value={r.code}>
              {r.label}
            </option>
          ))}
        </select>
        {gwp !== null ? (
          <p className="mt-1.5 rounded-lg bg-canvas px-3 py-2 text-[13px] text-muted">
            GWP: {gwp}
          </p>
        ) : null}
      </Field>
      {refrigerantCode === "Other" ? (
        <>
          <Field label="Refrigerant type" required>
            <input name="refrigerant_other" className={inputClass} placeholder="e.g. R454B" />
          </Field>
          <Field label="GWP" required hint="Global Warming Potential">
            <input
              value={manualGwp}
              onChange={(e) => setManualGwp(e.target.value)}
              inputMode="decimal"
              className={inputClass}
              placeholder="e.g. 466"
            />
          </Field>
        </>
      ) : null}

      <FormError>{clientError ?? state.error}</FormError>
      <Submit />
    </form>
  );
}
