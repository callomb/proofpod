"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { outbox, startOutbox } from "@/lib/ac/outbox";
import { useOnline, useOutboxOps, waitingOps } from "@/lib/ac/outbox/hooks";
import type { OutboxOp } from "@/lib/ac/outbox/types";

const KIND_LABEL: Record<OutboxOp["spec"]["kind"], string> = {
  photo: "Photo",
  stage: "Pressure test stage",
  pressureResult: "Pressure test result",
  evacChecklist: "Evacuation checklist",
  evacComplete: "Evacuation complete",
  charge: "Refrigerant charge",
  commissioning: "Commissioning details",
  temperature: "Temperature reading",
  drain: "Drain test",
  unit: "Unit details",
};

function timeOf(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Starts the background sender and shows what is still waiting to send. */
export function OutboxStatus() {
  const router = useRouter();
  const ops = useOutboxOps();
  const online = useOnline();

  useEffect(() => {
    startOutbox();
    const off = outbox.onBackgroundSynced(() => router.refresh());
    return () => {
      off();
    };
  }, [router]);

  const waiting = waitingOps(ops);
  const failed = waiting.filter((o) => o.status === "failed");
  const pending = waiting.filter((o) => o.status === "pending");
  if (waiting.length === 0) return null;

  return (
    <>
      {/* Keeps the bottom of the page reachable above the banner. */}
      <div aria-hidden className={failed.length > 0 ? "h-56" : "h-20"} />
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(max(env(safe-area-inset-bottom),0.5rem)+4.25rem)] z-30">
        <div className="pointer-events-auto mx-auto max-w-[460px] space-y-2 px-5">
          {failed.length > 0 ? (
            <div className="rounded-2xl border border-fail/30 bg-fail-soft p-3.5 shadow-pop">
              <p className="text-[13px] font-semibold text-fail">
                {failed.length} change{failed.length === 1 ? "" : "s"}{" "}
                couldn&apos;t be saved
              </p>
              <ul className="mt-2 space-y-2.5">
                {failed.map((o) => (
                  <li key={o.id} className="text-[12px] text-ink-soft">
                    <p className="font-medium">
                      {KIND_LABEL[o.spec.kind]} · taken {timeOf(o.capturedAt)}
                    </p>
                    <p className="text-fail">{o.error}</p>
                    <div className="mt-1.5 flex gap-2">
                      <button
                        onClick={() => void outbox.retry(o.id)}
                        className="rounded-full border border-line-strong bg-paper px-3 py-1 text-[12px] font-semibold"
                      >
                        Retry
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              "Discard this change? Anything that depended on it is discarded too.",
                            )
                          ) {
                            void outbox.discard(o.id);
                          }
                        }}
                        className="rounded-full border border-line-strong bg-paper px-3 py-1 text-[12px] font-semibold"
                      >
                        Discard
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {pending.length > 0 ? (
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-paper px-4 py-3 shadow-pop">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold">
                  {online ? "Sending…" : "No signal"} · {pending.length} waiting
                </p>
                <p className="text-[12px] text-muted">
                  {online
                    ? "Saved on this phone; sending now."
                    : "Saved on this phone. It will send when signal returns."}
                </p>
              </div>
              {online ? (
                <button
                  onClick={() => void outbox.processAll()}
                  className="shrink-0 rounded-full border border-line-strong px-3.5 py-1.5 text-[12px] font-semibold"
                >
                  Send now
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
