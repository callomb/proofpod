import type { StageKey, SystemKind, PressureTest } from "./types";

// ---------------------------------------------------------------------------
// Floors — a sensible wide range, ground floor ("0") default.
// ---------------------------------------------------------------------------
export const FLOOR_OPTIONS: string[] = [
  "B4", "B3", "B2", "B1",
  "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10",
  "11", "12", "13", "14", "15", "16", "17", "18", "19", "20",
  "Mezzanine", "Roof", "External",
];
export const DEFAULT_FLOOR = "0";

export function floorLabel(floor: string): string {
  if (floor === "0") return "Ground";
  if (/^B\d+$/.test(floor)) return `Basement ${floor.slice(1)}`;
  if (/^\d+$/.test(floor)) return `Level ${floor}`;
  return floor;
}

// ---------------------------------------------------------------------------
// Systems
// ---------------------------------------------------------------------------
export const SYSTEM_OPTIONS: { value: SystemKind; label: string }[] = [
  { value: "cold", label: "Cold" },
  { value: "hot", label: "Hot" },
  { value: "boosted", label: "Boosted" },
  { value: "heating", label: "Heating" },
  { value: "other", label: "Other" },
];

export function systemLabel(test: Pick<PressureTest, "system" | "system_other">): string {
  if (test.system === "other") return test.system_other?.trim() || "Other";
  return SYSTEM_OPTIONS.find((s) => s.value === test.system)?.label ?? test.system;
}

// ---------------------------------------------------------------------------
// Stages
// ---------------------------------------------------------------------------
export const STAGE_ORDER: StageKey[] = ["initial", "strength", "pressure"];

export const STAGE_META: Record<StageKey, { label: string }> = {
  initial: { label: "Initial Test" },
  strength: { label: "Strength Test" },
  pressure: { label: "Pressure Test" },
};

export function stageTargets(
  test: PressureTest,
  stage: StageKey,
): { pressure: number; duration: number } {
  switch (stage) {
    case "initial":
      return { pressure: test.initial_pressure_bar, duration: test.initial_duration_min };
    case "strength":
      return { pressure: test.strength_pressure_bar, duration: test.strength_duration_min };
    case "pressure":
      return { pressure: test.pressure_pressure_bar, duration: test.pressure_duration_min };
  }
}

/** The pressure stage requires start + end photographs. */
export function stageRequiresPhotos(stage: StageKey): boolean {
  return stage === "pressure";
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
export function formatBar(bar: number): string {
  const n = Number(bar);
  return `${Number.isInteger(n) ? n : n.toFixed(1)} bar`;
}

export function formatDuration(minutes: number): string {
  const m = Math.round(minutes);
  if (m < 60) return `${m} min${m === 1 ? "" : "s"}`;
  const h = Math.floor(m / 60);
  const rem = m % 60;
  return rem === 0 ? `${h}h` : `${h}h ${rem}m`;
}

/** e.g. "1h 22m" from two timestamps */
export function elapsedLabel(startISO: string, endISO: string): string {
  const ms = new Date(endISO).getTime() - new Date(startISO).getTime();
  const totalMin = Math.max(0, Math.round(ms / 60000));
  if (totalMin < 60) return `${totalMin}m`;
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${mins}m`;
}

export function timeOfDay(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 18) return "afternoon";
  return "evening";
}

export function firstName(fullName: string | null | undefined): string {
  if (!fullName) return "there";
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function initials(fullName: string | null | undefined): string {
  if (!fullName) return "?";
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Status presentation
// ---------------------------------------------------------------------------
export const TEST_STATUS_META = {
  in_progress: { label: "In Progress", tone: "progress" as const },
  passed: { label: "Passed", tone: "pass" as const },
  failed: { label: "Failed", tone: "fail" as const },
  void: { label: "Void", tone: "void" as const },
};

// ---------------------------------------------------------------------------
// Username-based accounts
//
// Supabase Auth identities are always an email address under the hood. For
// staff who sign in with a username (no real email), we derive a synthetic,
// unreachable address from the username. Anything containing "@" on the
// sign-in form is treated as a real email instead.
// ---------------------------------------------------------------------------
const USERNAME_EMAIL_DOMAIN = "users.proofpod.internal";

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  const u = normalizeUsername(raw);
  return /^[a-z0-9](?:[a-z0-9._-]{1,30})[a-z0-9]$/.test(u);
}

export function usernameToEmail(raw: string): string {
  return `${normalizeUsername(raw)}@${USERNAME_EMAIL_DOMAIN}`;
}

export function isEmailInput(raw: string): boolean {
  return raw.includes("@") && !raw.trim().toLowerCase().endsWith(`@${USERNAME_EMAIL_DOMAIN}`);
}

/** Generates an easy-to-read one-time password, e.g. "TAMP-4821-FOX". */
export function generatePassword(): string {
  const words = ["TAMP", "RIVET", "GAUGE", "VALVE", "BRICK", "TORCH", "FLUX", "COIL", "BOLT", "SEAL"];
  const word = words[Math.floor(Math.random() * words.length)];
  const digits = Math.floor(1000 + Math.random() * 9000);
  const tail = ["FOX", "OAK", "RIG", "BAY", "ELM", "TIN"][Math.floor(Math.random() * 6)];
  return `${word}-${digits}-${tail}`;
}
