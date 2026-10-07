/* eslint-disable jsx-a11y/alt-text -- these are @react-pdf/renderer <Image>, not HTML <img> */
import "server-only";

import type { ReactNode } from "react";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";

import { createAdminClient } from "../supabase/admin";
import { AC_SYSTEM_TYPE_META, EVACUATION_CHECKLIST_ITEMS } from "./domain";
import type { AcCertificateSnapshot, AcDocType } from "./types";

const DOC_TITLE: Record<AcDocType, string> = {
  pressure_test: "Refrigerant Pipe Leak Test Certificate",
  commissioning: "Split System Commissioning Certificate",
  drain_test: "Drain Test Certificate",
  fgas_log: "F-Gas Record — Log Sheet",
  fgas_inventory: "F-Gas Record — Inventory Entry",
  full: "Full Commissioning Certificate",
};

const ink = "#111111";
const muted = "#6b6b68";
const line = "#d8d8d4";

// Full Certificate — colour tokens mirror the app's own design system
// (src/app/globals.css) so the PDF reads as the same product, not a
// generic export.
const paper = "#ffffff";
const canvas = "#f6f6f5";
const lineSoft = "#e7e7e4";

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

// ---------------------------------------------------------------------------
// Full Certificate — a distinct, more formal document layout (bordered
// sections, tables, an evidence grid, a certification block) used only for
// docType "full". The five individual documents above keep their existing,
// simpler layout unchanged.
// ---------------------------------------------------------------------------
const fs = StyleSheet.create({
  page: { paddingTop: 48, paddingBottom: 52, paddingHorizontal: 48, fontSize: 9, color: ink, fontFamily: "Helvetica", lineHeight: 1.4, backgroundColor: paper },
  topBar: { height: 5, backgroundColor: ink, marginTop: -48, marginHorizontal: -48, marginBottom: 24 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  logo: { width: 100, height: 40, objectFit: "contain" },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: muted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.6 },
  companyName: { fontSize: 10.5, fontFamily: "Helvetica-Bold", textAlign: "right" },
  companyLine: { fontSize: 8, color: muted, textAlign: "right" },

  titleRow: { marginBottom: 18 },
  eyebrow: { fontSize: 8, fontFamily: "Helvetica-Bold", color: muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 4 },
  h1: { fontSize: 19, fontFamily: "Helvetica-Bold", marginBottom: 8 },
  metaRow: { flexDirection: "row", gap: 6 },
  metaText: { fontSize: 8.5, color: muted },


  section: { borderWidth: 1, borderColor: line, marginBottom: 14 },
  sectionHeader: { backgroundColor: canvas, paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: line },
  sectionHeaderText: { fontSize: 9, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.8 },
  sectionBody: { padding: 10 },

  detailTable: { borderWidth: 1, borderColor: lineSoft },
  detailRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: lineSoft, paddingVertical: 5, paddingHorizontal: 8 },
  detailRowLast: { borderBottomWidth: 0 },
  detailLabel: { width: "42%", fontSize: 8, color: muted },
  detailValue: { width: "58%", fontSize: 9 },

  dTable: { borderWidth: 1, borderColor: lineSoft },
  dRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: lineSoft },
  dRowLast: { borderBottomWidth: 0 },
  dHeaderRow: { backgroundColor: canvas },
  dHeaderCell: { fontSize: 7, fontFamily: "Helvetica-Bold", textTransform: "uppercase", letterSpacing: 0.4, color: muted, padding: 6 },
  dCell: { fontSize: 8.5, padding: 6 },
  dCellBorder: { borderRightWidth: 1, borderRightColor: lineSoft },

  equipRow: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  equipCard: { width: "48%", borderWidth: 1, borderColor: lineSoft, padding: 8, marginBottom: 8 },
  equipTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", marginBottom: 5 },
  equipLabel: { fontSize: 7, color: muted, textTransform: "uppercase", letterSpacing: 0.4 },
  equipValue: { fontSize: 8.5, marginBottom: 3 },

  evidenceGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-start", gap: 9 },
  evidenceCard: { width: "31.5%", marginBottom: 6 },
  evidenceImg: { width: "100%", height: 92, objectFit: "cover", borderWidth: 1, borderColor: lineSoft },
  evidenceCaption: { fontSize: 8, fontFamily: "Helvetica-Bold", marginTop: 4 },
  evidenceMeta: { fontSize: 7, color: muted, marginTop: 1 },

  certRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 20 },
  certCol: { width: "31%" },
  certValue: { fontSize: 11, fontFamily: "Helvetica-Bold", marginTop: 3 },
  signatureRow: { flexDirection: "row", justifyContent: "space-between" },
  signatureSlot: { width: "48%" },
  signatureImgWrap: { height: 48, justifyContent: "flex-end" },
  signatureImg: { height: 44, objectFit: "contain", objectPosition: "left" },
  signatureBox: { borderTopWidth: 1, borderTopColor: ink, paddingTop: 5 },

  footer: { position: "absolute", bottom: 24, left: 48, right: 48, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: muted, borderTopWidth: 1, borderTopColor: lineSoft, paddingTop: 6 },
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
        <Field label="Tonnes CO2 equivalent" value={num(c?.tonnes_co2e ?? null)} />
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

// ---------------------------------------------------------------------------
// Full Certificate building blocks
// ---------------------------------------------------------------------------

function FullHeader({ snapshot, logo }: { snapshot: AcCertificateSnapshot; logo?: EmbeddedImage }) {
  return (
    <>
      <View style={fs.topBar} fixed />
      <View style={fs.headerRow}>
        <View>
          {logo ? (
            <Image src={{ data: logo.data, format: logo.format }} style={fs.logo} />
          ) : (
            <>
              <Text style={fs.brand}>ProofPod</Text>
              <Text style={fs.brandSub}>AC Commissioning</Text>
            </>
          )}
        </View>
        <View>
          <Text style={fs.companyName}>{snapshot.company.name}</Text>
          {[snapshot.company.address_line1, snapshot.company.address_line2, snapshot.company.city, snapshot.company.postcode]
            .filter(Boolean)
            .map((l, i) => (
              <Text key={i} style={fs.companyLine}>{l}</Text>
            ))}
          {snapshot.company.phone ? <Text style={fs.companyLine}>{snapshot.company.phone}</Text> : null}
        </View>
      </View>
    </>
  );
}

function TitleBlock({ number, snapshot }: { number: string; snapshot: AcCertificateSnapshot }) {
  return (
    <View style={fs.titleRow}>
      <View>
        <Text style={fs.eyebrow}>Commissioning Certificate</Text>
        <Text style={fs.h1}>Split System Commissioning Certificate</Text>
        <View style={fs.metaRow}>
          <Text style={fs.metaText}>Certificate {number}</Text>
          <Text style={fs.metaText}>·</Text>
          <Text style={fs.metaText}>Issued {fmtDate(snapshot.issued_at)}</Text>
          <Text style={fs.metaText}>·</Text>
          <Text style={fs.metaText}>{snapshot.system.system_ref}</Text>
        </View>
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={fs.section} wrap={false}>
      <View style={fs.sectionHeader}>
        <Text style={fs.sectionHeaderText}>{title}</Text>
      </View>
      <View style={fs.sectionBody}>{children}</View>
    </View>
  );
}

function DetailTable({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <View style={fs.detailTable}>
      {rows.map((r, i) => (
        <View key={i} style={[fs.detailRow, i === rows.length - 1 ? fs.detailRowLast : undefined]}>
          <Text style={fs.detailLabel}>{r.label}</Text>
          <Text style={fs.detailValue}>{r.value}</Text>
        </View>
      ))}
    </View>
  );
}

interface DataColumn {
  key: string;
  label: string;
  width: string;
}

function DataTable({ columns, rows }: { columns: DataColumn[]; rows: Record<string, string>[] }) {
  return (
    <View style={fs.dTable}>
      <View style={[fs.dRow, fs.dHeaderRow]}>
        {columns.map((c, i) => (
          <Text
            key={c.key}
            style={[fs.dHeaderCell, { width: c.width }, i < columns.length - 1 ? fs.dCellBorder : undefined]}
          >
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((row, ri) => (
        <View key={ri} style={[fs.dRow, ri === rows.length - 1 ? fs.dRowLast : undefined]}>
          {columns.map((c, i) => (
            <Text
              key={c.key}
              style={[fs.dCell, { width: c.width }, i < columns.length - 1 ? fs.dCellBorder : undefined]}
            >
              {row[c.key] ?? "—"}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

function EquipCard({
  label,
  unit,
}: {
  label: string;
  unit: AcCertificateSnapshot["units"][number] | undefined;
}) {
  return (
    <View style={fs.equipCard}>
      <Text style={fs.equipTitle}>{label}</Text>
      <Text style={fs.equipLabel}>Location</Text>
      <Text style={fs.equipValue}>{unit?.location ?? "—"}</Text>
      <Text style={fs.equipLabel}>Asset no.</Text>
      <Text style={fs.equipValue}>{unit?.asset_number ?? "—"}</Text>
      <Text style={fs.equipLabel}>Model</Text>
      <Text style={fs.equipValue}>{unit?.model_number ?? "—"}</Text>
      <Text style={fs.equipLabel}>Serial</Text>
      <Text style={fs.equipValue}>{unit?.serial_number ?? "—"}</Text>
      {unit?.manufacture_date ? (
        <>
          <Text style={fs.equipLabel}>Date of manufacture</Text>
          <Text style={fs.equipValue}>{unit.manufacture_date}</Text>
        </>
      ) : null}
    </View>
  );
}

function unitLabel(unit: AcCertificateSnapshot["units"][number] | undefined, fallback: string) {
  if (!unit) return fallback;
  return unit.reference || unit.location || fallback;
}

function SignatureSlot({ label, image }: { label: string; image?: EmbeddedImage }) {
  return (
    <View style={fs.signatureSlot}>
      <View style={fs.signatureImgWrap}>
        {image ? <Image src={{ data: image.data, format: image.format }} style={fs.signatureImg} /> : null}
      </View>
      <View style={fs.signatureBox}>
        <Text style={fs.equipLabel}>{label}</Text>
      </View>
    </View>
  );
}

function FullFooter({ number }: { number: string }) {
  return (
    <View style={fs.footer} fixed>
      <Text>ProofPod · AC Commissioning</Text>
      <Text>{number}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
    </View>
  );
}

function FullCertificateDoc({
  number,
  snapshot,
  images,
  logo,
}: {
  number: string;
  snapshot: AcCertificateSnapshot;
  images: Images;
  logo?: EmbeddedImage;
}) {
  const outdoor = snapshot.units.find((u) => u.unit_role === "outdoor");
  const indoors = snapshot.units.filter((u) => u.unit_role === "indoor");
  const unitsById = new Map(
    snapshot.units.filter((u): u is typeof u & { id: string } => !!u.id).map((u) => [u.id, u]),
  );
  const pt = snapshot.pressure_test;
  const evac = snapshot.evacuation;
  const comm = snapshot.commissioning;
  const charge = snapshot.charge;

  const photoEntries: { path: string; label: string; takenAt: string; takenBy: string | null }[] = [];
  if (pt) {
    for (const stage of pt.stages) {
      for (const p of stage.photos ?? []) {
        photoEntries.push({
          path: p.storage_path,
          label: `Stage ${stage.stage_no} — ${p.subject === "pressure_start" ? "Start" : "End"}`,
          takenAt: p.taken_at,
          takenBy: p.taken_by_name ?? null,
        });
      }
    }
  }
  if (evac?.photo) {
    photoEntries.push({
      path: evac.photo.storage_path,
      label: "Evacuation — Final Vacuum",
      takenAt: evac.photo.taken_at,
      takenBy: evac.photo.taken_by_name ?? null,
    });
  }

  return (
    <Document>
      <Page size="A4" style={fs.page} wrap>
        <FullHeader snapshot={snapshot} logo={logo} />
        <TitleBlock number={number} snapshot={snapshot} />

        <Section title="Project &amp; System Details">
          <DetailTable
            rows={[
              { label: "Project", value: snapshot.project.name },
              { label: "Project number", value: snapshot.project.project_number ?? "—" },
              { label: "Client", value: snapshot.project.client_name ?? "—" },
              { label: "Site address", value: snapshot.project.site_address ?? "—" },
              { label: "System reference", value: snapshot.system.system_ref },
              {
                label: "System type",
                value: AC_SYSTEM_TYPE_META[snapshot.system.system_type]?.label ?? snapshot.system.system_type,
              },
              { label: "Area served", value: snapshot.system.area_served },
              { label: "Outdoor unit location", value: snapshot.system.outdoor_location },
              { label: "Manufacturer", value: snapshot.system.manufacturer },
              { label: "Refrigerant", value: `${snapshot.system.refrigerant} (GWP ${snapshot.system.gwp})` },
            ]}
          />
        </Section>

        <Section title="Equipment">
          <View style={fs.equipRow}>
            <EquipCard label="Outdoor Unit" unit={outdoor} />
            {indoors.map((u, i) => (
              <EquipCard key={i} label={u.reference || `Indoor Unit ${i + 1}`} unit={u} />
            ))}
          </View>
        </Section>

        {pt ? (
          <Section title={`Pressure Test — Attempt ${pt.attempt_no} · ${pt.status === "passed" ? "PASS" : pt.status.toUpperCase()}`}>
            <DataTable
              columns={[
                { key: "stage", label: "Stage", width: "8%" },
                { key: "target", label: "Target", width: "18%" },
                { key: "duration", label: "Duration", width: "18%" },
                { key: "status", label: "Status", width: "16%" },
                { key: "started", label: "Started", width: "20%" },
                { key: "completed", label: "Completed", width: "20%" },
              ]}
              rows={pt.stages.map((st) => ({
                stage: String(st.stage_no),
                target: `${st.target_pressure_bar} bar`,
                duration: st.target_duration_min === null ? "Until evacuated" : `${st.target_duration_min} min`,
                status: st.status.replace("_", " "),
                started: fmtDateTime(st.started_at),
                completed: fmtDateTime(st.completed_at),
              }))}
            />
          </Section>
        ) : null}

        {evac ? (
          <Section title="Evacuation">
            <DetailTable
              rows={[
                ...EVACUATION_CHECKLIST_ITEMS.map((item) => ({
                  label: item.label,
                  value: evac.checklist[item.key] ? "Yes" : "No",
                })),
                { label: "Completed", value: fmtDateTime(evac.completed_at) },
                { label: "Final vacuum photo", value: evac.photo ? "Captured — see evidence" : "—" },
              ]}
            />
          </Section>
        ) : null}

        {comm ? (
          <>
            <Section title="Installation Checks">
              <DetailTable
                rows={[
                  { label: "Transit brackets removed", value: yn(comm.transit_brackets_removed) },
                  { label: "Electrical connections tight", value: yn(comm.electrical_connections_tight) },
                  { label: "Local isolator fitted", value: yn(comm.local_isolator_fitted) },
                  { label: "Equipment labelled", value: yn(comm.equipment_labelled) },
                  { label: "Covers fixed and clean", value: yn(comm.covers_fixed_clean) },
                  { label: "Functional test satisfactory", value: yn(comm.functional_test_satisfactory) },
                ]}
              />
            </Section>
            <Section title="Electrical &amp; Pipework">
              <DetailTable
                rows={[
                  { label: "MCB / fuse spec", value: comm.mcb_fuse_spec ?? "—" },
                  { label: "Outdoor nameplate FLC", value: num(comm.outdoor_nameplate_flc_amps, " A") },
                  { label: "Suction pipe size", value: comm.suction_pipe_size ?? "—" },
                  { label: "Liquid pipe size", value: comm.liquid_pipe_size ?? "—" },
                  {
                    label: "Running current — cooling (L1/L2/L3)",
                    value: comm.current_cooling.map((v) => v ?? "—").join(" / "),
                  },
                  {
                    label: "Running current — heating (L1/L2/L3)",
                    value: comm.current_heating.map((v) => v ?? "—").join(" / "),
                  },
                ]}
              />
            </Section>
          </>
        ) : null}

        {snapshot.temperatures.length > 0 ? (
          <Section title="Air Temperatures">
            <DataTable
              columns={[
                { key: "unit", label: "Unit", width: "32%" },
                { key: "mode", label: "Mode", width: "16%" },
                { key: "on", label: "Air On", width: "16%" },
                { key: "off", label: "Air Off", width: "16%" },
                { key: "dt", label: "Delta T", width: "20%" },
              ]}
              rows={snapshot.temperatures.map((t) => {
                const dt =
                  t.air_on_c !== null && t.air_off_c !== null ? Math.abs(t.air_on_c - t.air_off_c).toFixed(1) : null;
                return {
                  unit: unitLabel(unitsById.get(t.ac_unit_id), "Indoor unit"),
                  mode: t.mode === "cooling" ? "Cooling" : "Heating",
                  on: num(t.air_on_c, "°C"),
                  off: num(t.air_off_c, "°C"),
                  dt: dt !== null ? `${dt}°C` : "—",
                };
              })}
            />
          </Section>
        ) : null}

        {snapshot.drain_tests.length > 0 ? (
          <Section title="Drain Test">
            <DataTable
              columns={[
                { key: "unit", label: "Unit", width: "30%" },
                { key: "type", label: "Type", width: "25%" },
                { key: "water", label: "Test Water", width: "20%" },
                { key: "result", label: "Result", width: "25%" },
              ]}
              rows={snapshot.drain_tests.map((d) => ({
                unit: unitLabel(unitsById.get(d.ac_unit_id), "Indoor unit"),
                type: d.drain_type === "pump" ? `Pump${d.pump_model ? ` (${d.pump_model})` : ""}` : "Gravity",
                water: num(d.water_added_litres, " L"),
                result: d.result.toUpperCase(),
              }))}
            />
          </Section>
        ) : null}

        {charge ? (
          <Section title="Refrigerant / F-Gas Record">
            <DetailTable
              rows={[
                { label: "Factory charge", value: num(charge.factory_charge_kg, " kg") },
                { label: "Factory pipe allowance", value: num(charge.factory_pipe_allowance_m, " m") },
                { label: "Installed pipe length", value: num(charge.installed_pipe_length_m, " m") },
                { label: "Additional charge", value: num(charge.actual_additional_kg, " kg") },
                { label: "Total installed charge", value: num(charge.total_charge_kg, " kg") },
                { label: "GWP", value: num(charge.gwp) },
                { label: "CO2 equivalent", value: `${charge.tonnes_co2e} tonnes` },
                { label: "Plant operator", value: snapshot.project.plant_operator ?? "—" },
                { label: "Operator contact", value: snapshot.project.operator_contact ?? "—" },
              ]}
            />
          </Section>
        ) : null}

        {photoEntries.length > 0 ? (
          <Section title="Evidence">
            <View style={fs.evidenceGrid}>
              {photoEntries.map(({ path, label, takenAt, takenBy }) =>
                images[path] ? (
                  <View key={path} style={fs.evidenceCard}>
                    <Image src={{ data: images[path].data, format: images[path].format }} style={fs.evidenceImg} />
                    <Text style={fs.evidenceCaption}>{label}</Text>
                    <Text style={fs.evidenceMeta}>
                      {takenBy ?? "—"} · {fmtDateTime(takenAt)}
                    </Text>
                  </View>
                ) : null,
              )}
            </View>
          </Section>
        ) : null}

        <Section title="Certification">
          <View style={fs.certRow}>
            <View style={fs.certCol}>
              <Text style={fs.equipLabel}>Commissioned By</Text>
              <Text style={fs.certValue}>{snapshot.completed_by_name ?? "—"}</Text>
            </View>
            <View style={fs.certCol}>
              <Text style={fs.equipLabel}>Company</Text>
              <Text style={fs.certValue}>{snapshot.company.name}</Text>
            </View>
            <View style={fs.certCol}>
              <Text style={fs.equipLabel}>Date</Text>
              <Text style={fs.certValue}>{snapshot.completed_at ? fmtDate(snapshot.completed_at) : "—"}</Text>
            </View>
          </View>
          <View style={fs.signatureRow}>
            <SignatureSlot
              label="Engineer signature"
              image={snapshot.engineer_signature_path ? images[snapshot.engineer_signature_path] : undefined}
            />
            {snapshot.witness ? (
              <SignatureSlot
                label={`Witness${snapshot.witness.name ? ` — ${snapshot.witness.name}` : ""}`}
                image={images[snapshot.witness.signature_path]}
              />
            ) : null}
          </View>
        </Section>

        <FullFooter number={number} />
      </Page>
    </Document>
  );
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
  const includesPressureTest = docType === "pressure_test" || docType === "full";
  const includesCommissioning = docType === "commissioning" || docType === "full";

  const photoPaths: { path: string; label: string }[] = [];
  if (includesPressureTest && snapshot.pressure_test) {
    for (const stage of snapshot.pressure_test.stages) {
      for (const p of stage.photos ?? []) {
        photoPaths.push({
          path: p.storage_path,
          label: `Stage ${stage.stage_no} ${p.subject === "pressure_start" ? "start" : "end"}`,
        });
      }
    }
  }
  if (includesCommissioning && snapshot.evacuation?.photo) {
    photoPaths.push({ path: snapshot.evacuation.photo.storage_path, label: "Evacuation" });
  }

  return (
    <Document>
      <Page size="A4" style={s.page} wrap>
        <CompanyHeader snapshot={snapshot} logo={logo} />
        <Text style={s.h1}>{DOC_TITLE[docType]}</Text>
        <Text style={s.intro}>
          {snapshot.project.name} · Certificate {number} · Issued {fmtDate(snapshot.issued_at)}
        </Text>

        <SystemSummary snapshot={snapshot} />
        {includesPressureTest ? <PressureTestBody snapshot={snapshot} /> : null}
        {includesCommissioning ? <CommissioningBody snapshot={snapshot} /> : null}
        {docType === "drain_test" || docType === "full" ? <DrainTestBody snapshot={snapshot} /> : null}
        {docType === "fgas_log" || docType === "fgas_inventory" || docType === "full" ? (
          <FGasBody snapshot={snapshot} />
        ) : null}

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
  if ((docType === "pressure_test" || docType === "full") && snapshot.pressure_test) {
    for (const stage of snapshot.pressure_test.stages) {
      photoPaths.push(...(stage.photos ?? []).map((p) => p.storage_path));
    }
  }
  if ((docType === "commissioning" || docType === "full") && snapshot.evacuation?.photo) {
    photoPaths.push(snapshot.evacuation.photo.storage_path);
  }
  if (docType === "full") {
    if (snapshot.engineer_signature_path) photoPaths.push(snapshot.engineer_signature_path);
    if (snapshot.witness?.signature_path) photoPaths.push(snapshot.witness.signature_path);
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
    docType === "full" ? (
      <FullCertificateDoc number={number} snapshot={snapshot} images={images} logo={logo} />
    ) : (
      <AcCertificateDoc number={number} docType={docType} snapshot={snapshot} images={images} logo={logo} />
    ),
  );
}
