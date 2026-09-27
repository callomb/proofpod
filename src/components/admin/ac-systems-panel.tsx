"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { issueAcCertificateAction, setAcProjectSettingsAction } from "@/lib/ac/certificate-actions";
import { AC_SYSTEM_STATUS_META, AC_SYSTEM_TYPE_META } from "@/lib/ac/domain";
import type { AcCertificate, AcDocType, AcProjectSettings, AcSystem } from "@/lib/ac/types";
import { Button, Card, Field, FormError, StatusDot, buttonClass, inputClass } from "@/components/ui";

const INDIVIDUAL_DOC_LABELS: { key: AcDocType; label: string }[] = [
  { key: "pressure_test", label: "Pressure Test Certificate" },
  { key: "commissioning", label: "Commissioning Certificate" },
  { key: "drain_test", label: "Drain Test Certificate" },
  { key: "fgas_log", label: "F-Gas Log" },
  { key: "fgas_inventory", label: "F-Gas Inventory" },
];

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={`shrink-0 text-faint transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden
    >
      <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SystemCertificates({
  projectId,
  system,
  certificates,
}: {
  projectId: string;
  system: AcSystem;
  certificates: AcCertificate[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [busyDoc, setBusyDoc] = useState<AcDocType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const statusMeta = AC_SYSTEM_STATUS_META[system.status];
  const isReady = system.status === "complete";

  const latestFor = (docType: AcDocType) =>
    certificates.filter((c) => c.doc_type === docType).sort((a, b) => b.issued_at.localeCompare(a.issued_at))[0];

  const issue = (docType: AcDocType) => {
    setError(null);
    setBusyDoc(docType);
    start(async () => {
      const res = await issueAcCertificateAction(system.id, docType);
      setBusyDoc(null);
      if (res.error && !res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  };

  const fullCert = latestFor("full");

  return (
    <Card className="p-4">
      <div className="mb-1 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold">{system.system_ref}</p>
          <p className="truncate text-[12px] text-muted">
            {AC_SYSTEM_TYPE_META[system.system_type]?.label ?? "AC system"}
            {system.area_served ? ` · ${system.area_served}` : ""}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[12px] font-medium">
          <StatusDot tone={statusMeta.tone} />
          {statusMeta.label}
        </span>
      </div>

      {fullCert ? (
        <p className="mb-3 text-[12px] text-muted">
          Certificate {fullCert.number} · Issued {fmtDate(fullCert.issued_at)}
        </p>
      ) : (
        <div className="mb-3" />
      )}

      {isReady ? (
        fullCert ? (
          <a
            href={`/admin/projects/${projectId}/ac/certificates/${fullCert.id}`}
            className={buttonClass("primary", "md", "w-full")}
          >
            Download Full System Certificate
          </a>
        ) : (
          <Button
            className="w-full"
            disabled={pending && busyDoc === "full"}
            onClick={() => issue("full")}
          >
            {pending && busyDoc === "full" ? "Issuing…" : "Issue Full System Certificate"}
          </Button>
        )
      ) : (
        <div className="flex h-11 items-center justify-center rounded-full bg-canvas text-[13px] font-medium text-faint">
          Not ready — complete commissioning first
        </div>
      )}

      <button
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="mt-3 flex w-full items-center justify-between py-1.5 text-[13px] font-medium text-muted hover:text-ink"
      >
        Individual Certificates
        <ChevronIcon open={expanded} />
      </button>

      {expanded ? (
        <div className="mt-1 space-y-2">
          {INDIVIDUAL_DOC_LABELS.map(({ key, label }) => {
            const cert = latestFor(key);
            return (
              <div key={key} className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-medium">{label}</p>
                  {cert ? (
                    <p className="text-[12px] text-muted">
                      {cert.number} · issued {fmtDate(cert.issued_at)}
                    </p>
                  ) : null}
                </div>
                {cert ? (
                  <a
                    href={`/admin/projects/${projectId}/ac/certificates/${cert.id}`}
                    className="shrink-0 rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] font-semibold hover:bg-paper"
                  >
                    Download
                  </a>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={pending && busyDoc === key}
                    onClick={() => issue(key)}
                  >
                    {pending && busyDoc === key ? "Issuing…" : "Issue"}
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      ) : null}

      {error ? (
        <div className="mt-3">
          <FormError>{error}</FormError>
        </div>
      ) : null}
    </Card>
  );
}

function ProjectSettingsForm({ projectId, settings }: { projectId: string; settings: AcProjectSettings | null }) {
  const router = useRouter();
  const [plantOperator, setPlantOperator] = useState(settings?.plant_operator ?? "");
  const [operatorContact, setOperatorContact] = useState(settings?.operator_contact ?? "");
  const [pending, start] = useTransition();
  const [saved, setSaved] = useState(false);

  const save = () => {
    setSaved(false);
    start(async () => {
      await setAcProjectSettingsAction(projectId, plantOperator, operatorContact);
      setSaved(true);
      router.refresh();
    });
  };

  return (
    <Card className="p-4">
      <p className="mb-3 text-[14px] font-semibold">F-Gas project details</p>
      <p className="mb-3 text-[12px] text-muted">
        Entered once here, reused on every system&apos;s F-Gas record for this project.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plant operator">
          <input value={plantOperator} onChange={(e) => setPlantOperator(e.target.value)} className={inputClass} />
        </Field>
        <Field label="Operator contact">
          <input value={operatorContact} onChange={(e) => setOperatorContact(e.target.value)} className={inputClass} />
        </Field>
      </div>
      <Button className="mt-3" size="sm" disabled={pending} onClick={save}>
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </Button>
    </Card>
  );
}

export function AcSystemsPanel({
  projectId,
  systems,
  certificates,
  projectSettings,
}: {
  projectId: string;
  systems: AcSystem[];
  certificates: AcCertificate[];
  projectSettings: AcProjectSettings | null;
}) {
  return (
    <div className="space-y-4">
      <ProjectSettingsForm projectId={projectId} settings={projectSettings} />
      {systems.length === 0 ? (
        <Card className="px-5 py-10 text-center text-[13px] text-muted">No AC systems on this project yet.</Card>
      ) : (
        systems.map((system) => (
          <SystemCertificates
            key={system.id}
            projectId={projectId}
            system={system}
            certificates={certificates.filter((c) => c.ac_system_id === system.id)}
          />
        ))
      )}
    </div>
  );
}
