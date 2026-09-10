"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTransition } from "react";

import { signOutAction } from "@/lib/actions";
import { Wordmark } from "@/components/wordmark";

const NAV = [
  { href: "/admin/projects", label: "Projects" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/company", label: "Company settings" },
];

export function AdminHeader({ initials, name }: { initials: string; name: string }) {
  const pathname = usePathname();
  const [pending, start] = useTransition();

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-paper/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1080px] items-center justify-between px-5 sm:px-8">
        <div className="flex items-center gap-8">
          <Link href="/admin/projects" aria-label="ProofPod admin">
            <Wordmark className="text-[17px]" />
          </Link>
          <nav className="hidden items-center gap-1 sm:flex">
            {NAV.map((item) => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-colors ${
                    active ? "bg-ink text-paper" : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/home" className="hidden text-[12px] font-medium text-muted hover:text-ink sm:block">
            Site view
          </Link>
          <button
            onClick={() => start(() => signOutAction())}
            disabled={pending}
            className="grid size-8 place-items-center rounded-full bg-ink text-[11px] font-semibold text-paper"
            aria-label={`Sign out ${name}`}
            title="Sign out"
          >
            {initials}
          </button>
        </div>
      </div>
      <nav className="flex items-center gap-1 overflow-x-auto border-t border-line px-4 py-2 sm:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium ${
                active ? "bg-ink text-paper" : "text-muted"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
        <Link href="/home" className="shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-muted">
          Site view
        </Link>
      </nav>
    </header>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-[1080px] px-5 py-8 sm:px-8">{children}</div>;
}
