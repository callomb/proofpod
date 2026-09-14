import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "pass" | "progress" | "fail" | "void" | "neutral";

const DOT_COLOR: Record<Tone, string> = {
  pass: "bg-pass",
  progress: "bg-progress",
  fail: "bg-fail",
  void: "bg-faint",
  neutral: "bg-faint",
};

export function StatusDot({ tone, className = "" }: { tone: Tone; className?: string }) {
  return (
    <span
      className={`inline-block size-2 shrink-0 rounded-full ${DOT_COLOR[tone]} ${className}`}
      aria-hidden
    />
  );
}

export function Card({
  as: As = "div",
  className = "",
  ...props
}: { as?: "div" | "section" | "article" } & ComponentProps<"div">) {
  return (
    <As
      className={`rounded-card border border-line bg-paper shadow-card ${className}`}
      {...props}
    />
  );
}

export function Screen({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto min-h-dvh w-full max-w-[460px] px-5 pb-28 pt-[max(env(safe-area-inset-top),1rem)]">
      {children}
    </div>
  );
}

export function BackLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M15 18l-6-6 6-6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {children}
    </Link>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-full font-semibold transition-colors disabled:opacity-40 disabled:pointer-events-none select-none";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-paper hover:bg-ink-soft",
  secondary: "border border-line-strong bg-paper text-ink hover:bg-canvas",
  ghost: "text-ink hover:bg-canvas",
  danger: "border border-fail/30 bg-fail-soft text-fail hover:bg-fail/10",
};

const BUTTON_SIZE = {
  md: "h-11 px-5 text-[15px]",
  lg: "h-14 px-6 text-base",
  sm: "h-9 px-4 text-[13px]",
};

export function buttonClass(
  variant: ButtonVariant = "primary",
  size: keyof typeof BUTTON_SIZE = "md",
  className = "",
) {
  return `${BUTTON_BASE} ${BUTTON_VARIANT[variant]} ${BUTTON_SIZE[size]} ${className}`;
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
} & ComponentProps<"button">) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function LinkButton({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: {
  variant?: ButtonVariant;
  size?: keyof typeof BUTTON_SIZE;
} & ComponentProps<typeof Link>) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

export function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-medium text-ink-soft">
        {label}
        {required ? <span className="text-fail"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-[12px] text-muted">{hint}</span> : null}
    </label>
  );
}

export const inputClass =
  "w-full rounded-xl border border-line-strong bg-paper px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-ink focus:outline-none";

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p className="rounded-xl bg-fail-soft px-3.5 py-2.5 text-[13px] text-fail">{children}</p>
  );
}

export function Muted({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`text-[13px] text-muted ${className}`}>{children}</span>;
}
