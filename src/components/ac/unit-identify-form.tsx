"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import {
  extractDataPlateAction,
  recordAcPhotoAction,
  updateAcUnitAction,
} from "@/lib/ac/actions";
import { assetNumberFromScan } from "@/lib/ac/domain";
import type { AcUnit } from "@/lib/ac/types";
import { Button, Card, Field, FormError, Muted, inputClass } from "../ui";
import { QrScanButton } from "./qr-scanner";

async function uploadEvidence(
  file: File,
  opts: { companyId: string; projectId: string; acSystemId: string },
): Promise<{ path: string; mime: string }> {
  const supabase = createClient();
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${opts.companyId}/${opts.projectId}/${opts.acSystemId}/${crypto.randomUUID()}.${ext || "jpg"}`;
  const { error } = await supabase.storage
    .from("evidence")
    .upload(path, file, { contentType: file.type || "image/jpeg", upsert: false });
  if (error) throw new Error(error.message);
  return { path, mime: file.type || "image/jpeg" };
}

export function UnitIdentifyForm({
  unit,
  companyId,
  projectId,
  acSystemId,
  role,
  showReference,
  showLocation,
}: {
  unit: AcUnit;
  companyId: string;
  projectId: string;
  acSystemId: string;
  role: "outdoor" | "indoor";
  showReference: boolean;
  showLocation: boolean;
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [reference, setReference] = useState(unit.reference ?? "");
  const [location, setLocation] = useState(unit.location ?? "");
  const [assetNumber, setAssetNumber] = useState(unit.asset_number ?? "");
  const [modelNumber, setModelNumber] = useState(unit.model_number ?? "");
  const [serialNumber, setSerialNumber] = useState(unit.serial_number ?? "");
  const [manufactureDate, setManufactureDate] = useState(unit.manufacture_date ?? "");

  const [photoBusy, setPhotoBusy] = useState(false);
  const [saveBusy, setSaveBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocrNote, setOcrNote] = useState<string | null>(null);

  const onDataPlateFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setPhotoBusy(true);
    setError(null);
    setOcrNote(null);
    try {
      const { path, mime } = await uploadEvidence(file, { companyId, projectId, acSystemId });
      const rec = await recordAcPhotoAction({
        acSystemId,
        acUnitId: unit.id,
        storagePath: path,
        subject: role === "outdoor" ? "outdoor_data_plate" : "indoor_data_plate",
        mime: file.type,
        sizeBytes: file.size,
      });
      if (rec.error) throw new Error(rec.error);

      const extracted = await extractDataPlateAction(unit.id, path, mime);
      if (extracted.error) throw new Error(extracted.error);
      if (extracted.model || extracted.serial || extracted.manufactureDate) {
        if (extracted.model) setModelNumber(extracted.model);
        if (extracted.serial) setSerialNumber(extracted.serial);
        if (extracted.manufactureDate) setManufactureDate(extracted.manufactureDate);
        setOcrNote("Suggested from the photo — check and correct before saving.");
      } else {
        setOcrNote("Photo saved. Couldn't read the model/serial automatically — enter them below.");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setPhotoBusy(false);
    }
  };

  const save = async () => {
    setSaveBusy(true);
    setError(null);
    const res = await updateAcUnitAction({
      unitId: unit.id,
      reference: showReference ? reference : undefined,
      location: showLocation ? location : undefined,
      assetNumber: assetNumberFromScan(assetNumber),
      modelNumber,
      serialNumber,
      manufactureDate,
    });
    setSaveBusy(false);
    if (res.error) setError(res.error);
    else router.push(`/projects/${projectId}/ac/${acSystemId}`);
  };

  return (
    <div className="space-y-5">
      {showReference ? (
        <Field
          label="Unit reference"
          hint={role === "outdoor" ? "e.g. OD-01" : "e.g. FCU-01"}
        >
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            className={inputClass}
            placeholder={role === "outdoor" ? "OD-01" : "FCU-01"}
          />
        </Field>
      ) : null}

      {showLocation ? (
        <Field label="Location" hint="Defaults to the area served — edit if different">
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            className={inputClass}
          />
        </Field>
      ) : null}

      <div>
        <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">Asset number</span>
        <QrScanButton onScan={(v) => setAssetNumber(assetNumberFromScan(v))} label={assetNumber ? "Scan again" : "Scan QR label"} full />
        <input
          value={assetNumber}
          onChange={(e) => setAssetNumber(e.target.value)}
          className={`${inputClass} mt-2`}
          placeholder="Or enter manually"
          autoComplete="off"
        />
      </div>

      <Card className="p-4">
        <p className="mb-3 text-[13px] font-medium text-ink-soft">Data plate</p>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={onDataPlateFile}
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={photoBusy}
          onClick={() => fileRef.current?.click()}
        >
          {photoBusy ? "Reading photo…" : "Photograph data plate"}
        </Button>
        {ocrNote ? <p className="mt-2 text-[12px] text-muted">{ocrNote}</p> : null}

        <div className="mt-4 space-y-4">
          <Field label="Model number">
            <input
              value={modelNumber}
              onChange={(e) => setModelNumber(e.target.value)}
              className={inputClass}
              placeholder="Enter or confirm from photo"
              autoComplete="off"
            />
          </Field>
          <Field label="Serial number">
            <input
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
              className={inputClass}
              placeholder="Enter or confirm from photo"
              autoComplete="off"
            />
          </Field>
          <Field label="Date of manufacture" hint="Optional — only if printed on the plate">
            <input
              value={manufactureDate}
              onChange={(e) => setManufactureDate(e.target.value)}
              className={inputClass}
              placeholder="e.g. 03/2024"
              autoComplete="off"
            />
          </Field>
        </div>
        <Muted className="mt-2 block">
          Confirm or correct these before saving — nothing from the photo is saved automatically.
        </Muted>
      </Card>

      <FormError>{error}</FormError>
      <Button size="lg" className="w-full" disabled={saveBusy} onClick={save}>
        {saveBusy ? "Saving…" : "Save"}
      </Button>
    </div>
  );
}
