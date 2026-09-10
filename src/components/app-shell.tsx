"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Wordmark } from "./wordmark";

export function AppHeader({ initials }: { initials: string }) {
  return (
    <header className="sticky top-0 z-20 -mx-5 mb-4 flex items-center justify-between border-b border-line bg-canvas/85 px-5 py-3 backdrop-blur-md">
      <Link href="/home" aria-label="ProofPod home">
        <Wordmark className="text-[17px]" />
      </Link>
      <Link
        href="/more"
        aria-label="Profile and menu"
        className="grid size-9 place-items-center rounded-full bg-ink text-[13px] font-semibold text-paper"
      >
        {initials}
      </Link>
    </header>
  );
}

function TabIcon({ name }: { name: "home" | "more" }) {
  if (name === "home") {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M3 10.5 12 4l9 6.5M5.5 9.5V19a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V9.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </svg>
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const items = [
    { href: "/home", label: "Home", name: "home" as const },
    { href: "/more", label: "More", name: "more" as const },
  ];
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-paper/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-[460px] items-stretch justify-around px-6 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            (item.href === "/more" && pathname.startsWith("/more")) ||
            (item.href === "/home" &&
              (pathname === "/home" || pathname.startsWith("/projects")));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center gap-1 rounded-lg px-6 py-1.5 text-[11px] font-medium ${
                active ? "text-ink" : "text-faint"
              }`}
            >
              <TabIcon name={item.name} />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/30 sm:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[460px] rounded-t-3xl border border-line bg-paper p-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] shadow-pop sm:rounded-3xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[17px] font-semibold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-canvas"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path
                d="M6 6l12 12M18 6L6 18"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
