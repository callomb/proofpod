"use client";

import Link from "next/link";
import { useTransition } from "react";

import { signOutAction } from "@/lib/actions";
import { Wordmark } from "@/components/wordmark";

export function PlatformHeader() {
  const [pending, start] = useTransition();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-5 sm:px-8">
        <Link href="/platform" className="flex items-center gap-2">
          <Wordmark className="text-[17px]" />
          <span className="rounded-full bg-canvas px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-muted">
            Platform
          </span>
        </Link>
        <button
          onClick={() => start(() => signOutAction())}
          disabled={pending}
          className="text-[13px] font-medium text-muted hover:text-ink"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}

export function PlatformShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[900px] px-5 py-8 sm:px-8">{children}</div>;
}
