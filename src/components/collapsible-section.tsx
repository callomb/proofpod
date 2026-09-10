"use client";

import { useState, type ReactNode } from "react";

export function CollapsibleSection({
  title,
  count,
  defaultOpen = false,
  children,
}: {
  title: string;
  count: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="border-t border-line py-1">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between py-3 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="text-[13px] font-semibold uppercase tracking-wide text-ink-soft">
            {title}
          </span>
          <span className="text-[13px] font-medium text-faint">{count}</span>
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`text-faint transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        >
          <path
            d="M6 9l6 6 6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open ? (
        count === 0 ? (
          <p className="pb-4 pt-1 text-[13px] text-faint">Nothing here yet.</p>
        ) : (
          <div className="space-y-1.5 pb-4 pt-1">{children}</div>
        )
      ) : null}
    </section>
  );
}
