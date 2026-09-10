/* eslint-disable jsx-a11y/alt-text -- these are @react-pdf/renderer <Image>, not HTML <img> */
import "server-only";

import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";

import { createAdminClient } from "./supabase/admin";
import type { CertificateSnapshot, CertSnapshotTest, StageKey } from "./types";

const STAGE_LABEL: Record<StageKey, string> = {
  initial: "Initial Test",
  strength: "Strength Test",
  pressure: "Pressure Test",
};

const SYSTEM_LABEL: Record<string, string> = {
  cold: "Cold",
  hot: "Hot",
  boosted: "Boosted",
  heating: "Heating",
  other: "Other",
};

function floorLabel(floor: string) {
  if (floor === "0") return "Ground";
  if (/^B\d+$/.test(floor)) return `Basement ${floor.slice(1)}`;
  if (/^\d+$/.test(floor)) return `Level ${floor}`;
  return floor;
}
function systemLabel(t: Pick<CertSnapshotTest, "system" | "system_other">) {
  if (t.system === "other") return t.system_other?.trim() || "Other";
  return SYSTEM_LABEL[t.system] ?? t.system;
}
function fmtBar(n: number | null) {
  if (n == null) return "—";
  return `${Number.isInteger(Number(n)) ? n : Number(n).toFixed(1)} bar`;
}
function fmtDur(m: number | null) {
  if (m == null) return "—";
  const min = Math.round(m);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const r = min % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}
function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}
function actualDuration(start: string | null, end: string | null) {
  if (!start || !end) return "—";
  const mins = Math.max(0, Math.round((+new Date(end) - +new Date(start)) / 60000));
  if (mins < 60) return `${mins}m`;
  const days = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  return days > 0 ? `${days}d ${h}h` : `${h}h ${m}m`;
}

const ink = "#111111";
const muted = "#6b6b68";
const line = "#d8d8d4";

const s = StyleSheet.create({
  page: {
    paddingTop: 48,
    paddingBottom: 56,
    paddingHorizontal: 48,
    fontSize: 9,
    color: ink,
    fontFamily: "Helvetica",
    lineHeight: 1.5,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 28,
  },
  logo: { width: 96, height: 40, objectFit: "contain" },
  brand: { fontSize: 15, fontFamily: "Helvetica-Bold" },
  brandSub: { fontSize: 8, color: muted, marginTop: 2 },
  companyName: { fontSize: 10, fontFamily: "Helvetica-Bold", textAlign: "right" },
  companyLine: { fontSize: 8, color: muted, textAlign: "right" },
  h1: { fontSize: 18, fontFamily: "Helvetica-Bold", marginBottom: 2 },
  h2: {
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    textTransform: "uppercase",
    letterSpacing: 1,
    color: muted,
    marginBottom: 8,
    marginTop: 20,
  },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: "50%", marginBottom: 8, paddingRight: 12 },
  label: { fontSize: 7.5, color: muted, textTransform: "uppercase", letterSpacing: 0.5 },
  value: { fontSize: 10 },
  hr: { borderBottomWidth: 1, borderBottomColor: line, marginVertical: 14 },
  testCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  testTitle: { fontSize: 12, fontFamily: "Helvetica-Bold" },
  passPill: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: "#1f7a43",
    borderWidth: 1,
    borderColor: "#1f7a43",
    borderRadius: 3,
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  tRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: line, paddingVertical: 5 },
  tHead: { flexDirection: "row", borderBottomWidth: 1.4, borderBottomColor: ink, paddingBottom: 4, marginTop: 6 },
  th: { fontSize: 7.5, color: muted, textTransform: "uppercase", letterSpacing: 0.4 },
  td: { fontSize: 8.5 },
  cStage: { width: "22%" },
  cReq: { width: "20%" },
  cStart: { width: "19%" },
  cEnd: { width: "19%" },
  cWho: { width: "20%" },
  photosWrap: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 10 },
  photoBox: { width: 234 },
  photo: { width: 234, height: 176, objectFit: "contain", borderWidth: 1, borderColor: line },
  photoCap: { fontSize: 7.5, color: muted, marginTop: 3 },
  footer: {
    position: "absolute",
    bottom: 28,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: muted,
    borderTopWidth: 1,
    borderTopColor: line,
    paddingTop: 6,
  },
});

interface EmbeddedImage {
  data: Buffer;
  format: "jpg" | "png";
}

async function fetchPhotos(
  snapshot: CertificateSnapshot,
): Promise<Record<string, EmbeddedImage>> {
  const admin = createAdminClient();
  const paths = new Set<string>();
  for (const t of snapshot.tests) for (const p of t.photos ?? []) paths.add(p.storage_path);

  const out: Record<string, EmbeddedImage> = {};
  await Promise.all(
    [...paths].map(async (path) => {
      const { data, error } = await admin.storage.from("evidence").download(path);
      if (error || !data) return;
      const buf = Buffer.from(await data.arrayBuffer());
      const format: "jpg" | "png" = path.toLowerCase().endsWith(".png") ? "png" : "jpg";
      out[path] = { data: buf, format };
    }),
  );
  return out;
}

function CompanyHeader({ snapshot, logo }: { snapshot: CertificateSnapshot; logo?: EmbeddedImage }) {
  const c = snapshot.company;
  const addr = [c.address_line1, c.address_line2, c.city, c.postcode]
    .filter(Boolean)
    .join(", ");
  return (
    <View style={s.headerRow}>
      <View>
        {logo ? (
          <Image style={s.logo} src={{ data: logo.data, format: logo.format }} />
        ) : (
          <Text style={s.brand}>ProofPod</Text>
        )}
        <Text style={s.brandSub}>Pressure Test Certificate</Text>
      </View>
      <View>
        <Text style={s.companyName}>{c.name}</Text>
        {addr ? <Text style={s.companyLine}>{addr}</Text> : null}
        {c.phone ? <Text style={s.companyLine}>{c.phone}</Text> : null}
      </View>
    </View>
  );
}

function Footer({ number }: { number: string }) {
  return (
    <View style={s.footer} fixed>
      <Text>{number}</Text>
      <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
      <Text>Generated by ProofPod</Text>
    </View>
  );
}

function Cell({ label, value }: { label: string; value: string }) {
  return (
    <View style={s.cell}>
      <Text style={s.label}>{label}</Text>
      <Text style={s.value}>{value || "—"}</Text>
    </View>
  );
}

function TestEvidence({
  test,
  images,
}: {
  test: CertSnapshotTest;
  images: Record<string, EmbeddedImage>;
}) {
  const stages = (test.stages ?? []).filter((st) => st.started_at || st.completed_at);
  const photos = test.photos ?? [];
  const pressurePhotos = photos.filter((p) => p.stage === "pressure");
  const otherPhotos = photos.filter((p) => p.stage !== "pressure");

  return (
    <View wrap>
      <View style={s.testCardHeader}>
        <Text style={s.testTitle}>
          {floorLabel(test.floor)} · {systemLabel(test)} · {test.area}
        </Text>
        <Text style={s.passPill}>RESULT: PASS</Text>
      </View>
      <View style={s.grid}>
        <Cell label="Test ID" value={test.ref} />
        <Cell label="Passed" value={`${test.result_by} · ${fmtDateTime(test.result_at)}`} />
      </View>

      <View style={s.tHead}>
        <Text style={[s.th, s.cStage]}>Stage</Text>
        <Text style={[s.th, s.cReq]}>Required</Text>
        <Text style={[s.th, s.cStart]}>Start</Text>
        <Text style={[s.th, s.cEnd]}>End</Text>
        <Text style={[s.th, s.cWho]}>By</Text>
      </View>
      {stages.map((st) => (
        <View key={st.stage} style={s.tRow}>
          <Text style={[s.td, s.cStage]}>{STAGE_LABEL[st.stage]}</Text>
          <Text style={[s.td, s.cReq]}>
            {fmtBar(st.target_pressure_bar)} · min {fmtDur(st.target_duration_min)}
          </Text>
          <Text style={[s.td, s.cStart]}>{fmtDateTime(st.started_at)}</Text>
          <Text style={[s.td, s.cEnd]}>
            {fmtDateTime(st.completed_at)}
            {st.completed_at ? `\n(${actualDuration(st.started_at, st.completed_at)})` : ""}
          </Text>
          <Text style={[s.td, s.cWho]}>
            {st.started_by ?? "—"}
            {st.completed_by && st.completed_by !== st.started_by ? `\n→ ${st.completed_by}` : ""}
          </Text>
        </View>
      ))}

      {pressurePhotos.length > 0 ? (
        <>
          <Text style={s.h2}>Pressure test — gauge evidence</Text>
          <View style={s.photosWrap}>
            {pressurePhotos.map((p, i) => {
              const img = images[p.storage_path];
              if (!img) return null;
              return (
                <View key={i} style={s.photoBox}>
                  <Image style={s.photo} src={{ data: img.data, format: img.format }} />
                  <Text style={s.photoCap}>
                    {p.kind === "start" ? "Start gauge" : p.kind === "end" ? "End gauge" : "Evidence"}
                    {" · "}
                    {fmtDateTime(p.taken_at)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      {otherPhotos.length > 0 ? (
        <>
          <Text style={s.h2}>Other evidence</Text>
          <View style={s.photosWrap}>
            {otherPhotos.map((p, i) => {
              const img = images[p.storage_path];
              if (!img) return null;
              return (
                <View key={i} style={s.photoBox}>
                  <Image style={s.photo} src={{ data: img.data, format: img.format }} />
                  <Text style={s.photoCap}>
                    {p.stage ? STAGE_LABEL[p.stage] : "Evidence"} · {fmtDateTime(p.taken_at)}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      ) : null}

      <View style={s.hr} />
    </View>
  );
}

function CertificateDoc({
  number,
  snapshot,
  images,
  logo,
}: {
  number: string;
  snapshot: CertificateSnapshot;
  images: Record<string, EmbeddedImage>;
  logo?: EmbeddedImage;
}) {
  const p = snapshot.project;
  return (
    <Document
      title={`ProofPod Certificate ${number}`}
      author="ProofPod"
      subject={`Pressure test certificate for ${p.name}`}
    >
      <Page size="A4" style={s.page}>
        <CompanyHeader snapshot={snapshot} logo={logo} />

        <Text style={s.h1}>Pressure Test Certificate</Text>
        <Text style={{ color: muted, marginBottom: 4 }}>
          This certificate records completed and passed pressure tests. It is a
          historical document — the details below are fixed as at the issue date.
        </Text>

        <Text style={s.h2}>Project</Text>
        <View style={s.grid}>
          <Cell label="Project" value={p.name} />
          <Cell label="Project number" value={p.project_number ?? ""} />
          <Cell label="Client / main contractor" value={p.client_name ?? ""} />
          <Cell label="Site address" value={p.site_address ?? ""} />
        </View>

        <Text style={s.h2}>Certificate</Text>
        <View style={s.grid}>
          <Cell label="Certificate number" value={number} />
          <Cell label="Issue date" value={fmtDate(snapshot.issued_at)} />
          <Cell label="Tests on this certificate" value={String(snapshot.tests.length)} />
          <Cell label="Overall result" value="PASS" />
        </View>

        <Text style={s.h2}>Tests included</Text>
        <View style={s.tHead}>
          <Text style={[s.th, { width: "18%" }]}>Test ID</Text>
          <Text style={[s.th, { width: "16%" }]}>Floor</Text>
          <Text style={[s.th, { width: "18%" }]}>System</Text>
          <Text style={[s.th, { width: "34%" }]}>Area</Text>
          <Text style={[s.th, { width: "14%" }]}>Result</Text>
        </View>
        {snapshot.tests.map((t) => (
          <View key={t.id} style={s.tRow}>
            <Text style={[s.td, { width: "18%" }]}>{t.ref}</Text>
            <Text style={[s.td, { width: "16%" }]}>{floorLabel(t.floor)}</Text>
            <Text style={[s.td, { width: "18%" }]}>{systemLabel(t)}</Text>
            <Text style={[s.td, { width: "34%" }]}>{t.area}</Text>
            <Text style={[s.td, { width: "14%", color: "#1f7a43" }]}>PASS</Text>
          </View>
        ))}

        <Footer number={number} />
      </Page>

      {snapshot.tests.map((t) => (
        <Page key={t.id} size="A4" style={s.page}>
          <CompanyHeader snapshot={snapshot} logo={logo} />
          <Text style={s.h1}>Test evidence</Text>
          <Text style={{ color: muted, marginBottom: 6 }}>
            {p.name} · Certificate {number}
          </Text>
          <TestEvidence test={t} images={images} />
          <Footer number={number} />
        </Page>
      ))}
    </Document>
  );
}

/** Render the certificate PDF to a Buffer from its immutable snapshot. */
export async function renderCertificatePdf(
  number: string,
  snapshot: CertificateSnapshot,
): Promise<Buffer> {
  const images = await fetchPhotos(snapshot);

  let logo: EmbeddedImage | undefined;
  if (snapshot.company.logo_path) {
    try {
      const admin = createAdminClient();
      const { data } = await admin.storage
        .from("branding")
        .download(snapshot.company.logo_path);
      if (data) {
        const buf = Buffer.from(await data.arrayBuffer());
        logo = {
          data: buf,
          format: snapshot.company.logo_path.toLowerCase().endsWith(".png") ? "png" : "jpg",
        };
      }
    } catch {
      /* logo optional */
    }
  }

  return renderToBuffer(
    <CertificateDoc number={number} snapshot={snapshot} images={images} logo={logo} />,
  );
}
