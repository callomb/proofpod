"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { issueCertificateAction } from "@/lib/certificate-actions";
import { floorLabel, systemLabel } from "@/lib/domain";
import type { Certificate, PressureTest } from "@/lib/types";
import { Button, Card, FormError } from "@/components/ui";

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function CertificatesPanel({
  projectId,
  passedTests,
  certificates,
}: {
  projectId: string;
  passedTests: PressureTest[];
  certificates: Certificate[];
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const generate = () => {
    setError(null);
    setNotice(null);
    start(async () => {
      const res = await issueCertificateAction(projectId, [...selected]);
      if (res.error && !res.ok) {
        setError(res.error);
        return;
      }
      setSelected(new Set());
      setNotice(
        res.error
          ? `Certificate ${res.number} issued (${res.error})`
          : `Certificate ${res.number} issued.`,
      );
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-1 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
          Available to issue
        </h3>
        <p className="mb-3 text-[13px] text-muted">
          Only passed tests can be certified. Select one or more, then generate.
        </p>

        {passedTests.length === 0 ? (
          <Card className="px-5 py-10 text-center text-[13px] text-muted">
            No passed tests on this project yet.
          </Card>
        ) : (
          <Card className="divide-y divide-line">
            {passedTests.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer items-center gap-3 px-4 py-3 hover:bg-canvas"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium">
                    {floorLabel(t.floor)} · {systemLabel(t)} · {t.area}
                  </span>
                  <span className="block truncate text-[12px] text-muted">{t.ref}</span>
                </span>
              </label>
            ))}
          </Card>
        )}

        {error ? (
          <div className="mt-3">
            <FormError>{error}</FormError>
          </div>
        ) : null}
        {notice ? <p className="mt-3 text-[13px] text-pass">{notice}</p> : null}

        <Button
          className="mt-4"
          disabled={selected.size === 0 || pending}
          onClick={generate}
        >
          {pending
            ? "Generating…"
            : `Generate certificate${selected.size > 1 ? ` (${selected.size} tests)` : ""}`}
        </Button>
      </section>

      <section>
        <h3 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
          Issued certificates
        </h3>
        {certificates.length === 0 ? (
          <p className="text-[13px] text-muted">None issued yet.</p>
        ) : (
          <div className="space-y-2">
            {certificates.map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div>
                  <p className="text-[14px] font-semibold">{c.number}</p>
                  <p className="text-[12px] text-muted">
                    Issued {fmtDate(c.issued_at)} · {c.test_count} test
                    {c.test_count === 1 ? "" : "s"}
                  </p>
                </div>
                <a
                  href={`/admin/projects/${projectId}/certificates/${c.id}`}
                  className="rounded-full border border-line-strong px-4 py-2 text-[13px] font-semibold hover:bg-canvas"
                >
                  Download
                </a>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
