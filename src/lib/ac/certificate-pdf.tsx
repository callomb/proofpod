/* eslint-disable jsx-a11y/alt-text -- these are @react-pdf/renderer <Image>, not HTML <img> */
import "server-only";

import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { createAdminClient } from "../supabase/admin";
import type { AcCertificateSnapshot, AcDocType } from "./types";

const DOC_TITLE: Record<AcDocType, string> = {
  pressure_test: "Refrigerant Pipe Leak Test Certificate",
  commissioning: "Split System Commissioning Certificate",
  drain_test: "Drain Test Certificate",
  fgas_log: "F-Gas Record — Log Sheet",
  fgas_inventory: "F-Gas Record — Inventory Entry",
};

const ink = "#111111";
const muted = "#6b6b68";
const line = "#d8d8d4";

const s = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 56, paddingHorizontal: 48, fontSize: 9, color: ink, fontFamily: "Helvetica", lineHeight: 1.5 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 28 },
  logo: { width: 96, height: 40, objectFit: "contain" },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: muted, marginTop: 2 },
  companyName: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  companyLine: { fontSize: 8, color: muted, textAlign: "right" },
  h1: { fontSize: 16, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  intro: { fontSize: 8.5, color: muted, marginBottom: 6, maxWidth: 420 },
  h2: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 1, color: muted, marginBottom: 8, marginTop: 20 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "33.33%", marginBottom: 8, paddingRight: 12 },
  cellWide: { width: "50%", marginBottom: 8, paddingRight: 12 },
  label: { fontSize: 7.5, color: muted, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10 },
  hr: { borderBottomWidth: 1, borderBottomColor: line, marginVertical: 14 },
  photoRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  photo: { width: 140, height: 100, objectFit: "cover", borderRadius: 4 },
  footer: { position: "absolute", bottom: 28, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: muted },
});

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}
function yn(v: boolean | null) {
  if (v === null) return "—";
  return v ? "Yes" : "No";
}
function num(v: number | null, unit = "") {
  if (v === null || v === undefined) return "—";
  return `${v}${unit}`;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value}</Text>
    </View>
  );
}

interface EmbeddedImage {
  data: Buffer;
  format: "png" | "jpg";
}

function CompanyHeader({ snapshot, logo }: { snapshot: AcCertificateSnapshot; logo?: EmbeddedImage }) {
  return (
    <View style={s.headerRow}>
      <View>
        {logo ? (
          <Image src={{ data: logo.data, format: logo.format }} style={s.logo} />
        ) : (
          <>
            <Text style={s.brand}>ProofPod</Text>
            <Text style={s.brandSub}>Evidence capture — AC Commissioning</Text>
          </>
        )}
      </View>
      <View>
        <Text style={s.companyName}>{snapshot.company.name}</Text>
        {[snapshot.company.address_line1, snapshot.company.address_line2, snapshot.company.city, snapshot.company.postcode]
          .filter(Boolean)
          .map((l, i) => (
            <Text key={i} style={s.companyLine}>{l}</Text>
          ))}
        {snapshot.company.phone ? <Text style={s.companyLine}>{snapshot.company.phone}</Text> : null}
      </View>
    </View>
  );
}

function SystemSummary({ snapshot }: { snapshot: AcCertificateSnapshot }) {
  const outdoor = snapshot.units.find((u) => u.unit_role === "outdoor");
  const indoors = snapshot.units.filter((u) => u.unit_role === "indoor");
  return (
    <>
      <Text style={s.h2}>System</Text>
      <View style={s.grid}>
        <Field label="Project" value={snapshot.project.name} />
        <Field label="System reference" value={snapshot.system.system_ref} />
        <Field label="Area served" value={snapshot.system.area_served} />
        <Field label="Manufacturer" value={snapshot.system.manufacturer} />
        <Field label="Refrigerant" value={`${snapshot.system.refrigerant} (GWP ${snapshot.system.gwp})`} />
        <Field label="Outdoor unit location" value={snapshot.system.outdoor_location} />
      </View>
      <Text style={s.h2}>Equipment</Text>
      <View style={s.grid}>
        <Field label="Outdoor asset no." value={outdoor?.asset_number ?? "—"} />
        <Field label="Outdoor model" value={outdoor?.model_number ?? "—"} />
        <Field label="Outdoor serial" value={outdoor?.serial_number ?? "—"} />
        {indoors.map((u, i) => (
          <>
            <Field key={`r${i}`} label={`Indoor ${i + 1} ref.`} value={u.reference ?? "—"} />
            <Field key={`m${i}`} label={`Indoor ${i + 1} model`} value={u.model_number ?? "—"} />
            <Field key={`s${i}`} label={`Indoor ${i + 1} serial`} value={u.serial_number ?? "—"} />
          </>
        ))}
      </View>
    </>
  );
}

function PressureTestBody({ snapshot }: { snapshot: AcCertificateSnapshot }) {
  const t = snapshot.pressure_test;
  if (!t) return null;
  return (
    <>
      <Text style={s.h2}>Pressure test — attempt {t.attempt_no}</Text>
      <View style={s.grid}>
        <Field label="Result" value={t.status === "passed" ? "PASS" : t.status.toUpperCase()} />
        <Field label="Result recorded" value={fmtDateTime(t.result_at)} />
      </View>
      {t.stages.map((stage) => (
        <View key={stage.stage_no} style={s.grid}>
          <Field
            label={`Stage ${stage.stage_no} target`}
            value={`${stage.target_pressure_bar} bar · ${
              stage.target_duration_min === null ? "until evacuated" : num(stage.target_duration_min, " min")
            }`}
          />
          <Field label={`Stage ${stage.stage_no} started`} value={fmtDateTime(stage.started_at)} />
          <Field label={`Stage ${stage.stage_no} completed`} value={fmtDateTime(stage.completed_at)} />
        </View>
      ))}
    </>
  );
}

function CommissioningBody({ snapshot }: { snapshot: AcCertificateSnapshot }) {
  const c = snapshot.commissioning;
  if (!c) return null;
  return (
    <>
      <Text style={s.h2}>Installation checks</Text>
      <View style={s.grid}>
        <Field label="Transit brackets removed" value={yn(c.transit_brackets_removed)} />
        <Field label="Electrical connections tight" value={yn(c.electrical_connections_tight)} />
        <Field label="Local isolator fitted" value={yn(c.local_isolator_fitted)} />
        <Field label="Equipment labelled" value={yn(c.equipment_labelled)} />
        <Field label="Covers fixed and clean" value={yn(c.covers_fixed_clean)} />
        <Field label="Functional test satisfactory" value={yn(c.functional_test_satisfactory)} />
      </View>
      <Text style={s.h2}>Electrical &amp; pipework</Text>
      <View style={s.grid}>
        <Field label="MCB / fuse" value={c.mcb_fuse_spec ?? "—"} />
        <Field label="Outdoor nameplate FLC" value={num(c.outdoor_nameplate_flc_amps, " A")} />
        <Field label="Suction pipe size" value={c.suction_pipe_size ?? "—"} />
        <Field label="Liquid pipe size" value={c.liquid_pipe_size ?? "—"} />
        <Field label="Current — cooling (L1/L2/L3)" value={c.current_cooling.map((v) => (v ?? "—")).join(" / ")} />
        <Field label="Current — heating (L1/L2/L3)" value={c.current_heating.map((v) => (v ?? "—")).join(" / ")} />
      </View>
      <Text style={s.h2}>Temperatures</Text>
      <View style={s.grid}>
        {snapshot.temperatures.map((t, i) => (
          <Field
            key={i}
            label={`${t.mode === "cooling" ? "Cooling" : "Heating"} air on / off`}
            value={`${num(t.air_on_c, "°C")} / ${num(t.air_off_c, "°C")}`}
          />
        ))}
      </View>
    </>
  );
}

function DrainTestBody({ snapshot }: { snapshot: AcCertificateSnapshot }) {
  return (
    <>
      <Text style={s.h2}>Drain test</Text>
      <View style={s.grid}>
        {snapshot.drain_tests.map((d, i) => (
          <>
            <Field key={`t${i}`} label="Drain type" value={d.drain_type === "pump" ? `Pump${d.pump_model ? ` (${d.pump_model})` : ""}` : "Gravity"} />
            <Field key={`w${i}`} label="Test water added" value={num(d.water_added_litres, " L")} />
            <Field key={`r${i}`} label="Result" value={d.result.toUpperCase()} />
          </>
        ))}
      </View>
    </>
  );
}

function FGasBody({ snapshot }: { snapshot: AcCertificateSnapshot }) {
  const c = snapshot.charge;
  return (
    <>
      <Text style={s.h2}>Refrigerant inventory</Text>
      <View style={s.grid}>
        <Field label="Factory charge" value={num(c?.factory_charge_kg ?? null, " kg")} />
        <Field label="Additional charge" value={num(c?.actual_additional_kg ?? null, " kg")} />
        <Field label="Total installed charge" value={num(c?.total_charge_kg ?? null, " kg")} />
        <Field label="GWP" value={num(c?.gwp ?? null)} />
        <Field label="Tonnes CO₂ equivalent" value={num(c?.tonnes_co2e ?? null)} />
        <Field label="Plant operator" value={snapshot.project.plant_operator ?? "—"} />
        <Field label="Operator contact" value={snapshot.project.operator_contact ?? "—"} />
        <Field label="Cooling loads served" value={snapshot.system.area_served} />
        <Field label="Condenser / plant location" value={snapshot.system.outdoor_location} />
      </View>
    </>
  );
}

function Footer({ number }: { number: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>ProofPod · AC Commissioning</Text>
      <Text>{number}</Text>
    </View>
  );
}

interface Images {
  [path: string]: EmbeddedImage;
}

function AcCertificateDoc({
  number,
  docType,
  snapshot,
  images,
  logo,
}: {
  number: string;
  docType: AcDocType;
  snapshot: AcCertificateSnapshot;
  images: Images;
  logo?: EmbeddedImage;
}) {
  const photoPaths: { path: string; label: string }[] = [];
  if (docType === "pressure_test" && snapshot.pressure_test) {
    for (const stage of snapshot.pressure_test.stages) {
      for (const p of stage.photos ?? []) {
        photoPaths.push({
          path: p.storage_path,
          label: `Stage ${stage.stage_no} ${p.subject === "pressure_start" ? "start" : "end"}`,
        });
      }
    }
  }
  if (docType === "commissioning" && snapshot.evacuation?.photo) {
    photoPaths.push({ path: snapshot.evacuation.photo.storage_path, label: "Evacuation" });
  }

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <CompanyHeader snapshot={snapshot} logo={logo} />
        <Text style={s.h1}>{DOC_TITLE[docType]}</Text>
        <Text style={s.intro}>
          {snapshot.project.name} · Certificate {number} · Issued {fmtDate(snapshot.issued_at)}
        </Text>

        <SystemSummary snapshot={snapshot} />
        {docType === "pressure_test" ? <PressureTestBody snapshot={snapshot} /> : null}
        {docType === "commissioning" ? <CommissioningBody snapshot={snapshot} /> : null}
        {docType === "drain_test" ? <DrainTestBody snapshot={snapshot} /> : null}
        {docType === "fgas_log" || docType === "fgas_inventory" ? <FGasBody snapshot={snapshot} /> : null}

        {photoPaths.length > 0 ? (
          <>
            <View style={s.hr} />
            <Text style={s.h2}>Evidence</Text>
            <View style={s.photoRow}>
              {photoPaths.map(({ path, label }) =>
                images[path] ? (
                  <View key={path}>
                    <Image src={{ data: images[path].data, format: images[path].format }} style={s.photo} />
                    <Text style={[s.label, { marginTop: 3 }]}>{label}</Text>
                  </View>
                ) : null,
              )}
            </View>
          </>
        ) : null}

        <Footer number={number} />
      </Page>
    </Document>
  );
}

async function fetchPhotos(paths: string[]): Promise<Images> {
  if (paths.length === 0) return {};
  const admin = createAdminClient();
  const out: Images = {};
  await Promise.all(
    paths.map(async (path) => {
      try {
        const { data } = await admin.storage.from("evidence").download(path);
        if (!data) return;
        const buf = Buffer.from(await data.arrayBuffer());
        out[path] = { data: buf, format: path.toLowerCase().endsWith(".png") ? "png" : "jpg" };
      } catch {
        /* skip missing photo */
      }
    }),
  );
  return out;
}

/** Render an AC certificate PDF to a Buffer from its immutable snapshot. */
export async function renderAcCertificatePdf(
  number: string,
  docType: AcDocType,
  snapshot: AcCertificateSnapshot,
): Promise<Buffer> {
  const photoPaths: string[] = [];
  if (docType === "pressure_test" && snapshot.pressure_test) {
    for (const stage of snapshot.pressure_test.stages) {
      photoPaths.push(...(stage.photos ?? []).map((p) => p.storage_path));
    }
  }
  if (docType === "commissioning" && snapshot.evacuation?.photo) {
    photoPaths.push(snapshot.evacuation.photo.storage_path);
  }
  const images = await fetchPhotos(photoPaths);

  let logo: EmbeddedImage | undefined;
  if (snapshot.company.logo_path) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.storage.from("branding").download(snapshot.company.logo_path);
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        logo = { data: buf, format: snapshot.company.logo_path.toLowerCase().endsWith(".png") ? "png" : "jpg" };
      }
    } catch {
      /* logo optional */
    }
  }

  return renderToBuffer(
    <AcCertificateDoc number={number} docType={docType} snapshot={snapshot} images={images} logo={logo} />,
  );
}
