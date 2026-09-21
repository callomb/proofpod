import "server-only";

import { createAdminClient } from "./supabase/admin";

export interface MemberActivity {
  /** From Supabase Auth — available for everyone, including before tracking began. */
  lastSignIn: string | null;
  /** Sign-ins recorded since tracking began (see TRACKING_SINCE). */
  signIns: number;
  /** Most recent recorded action of any kind (login, stage started, test passed…). */
  lastActive: string | null;
}

/** Sign-in counting started when this shipped; earlier logins weren't recorded. */
export const TRACKING_SINCE = "2026-09-21";

/** Login/activity summary for a set of users. Service role — callers must scope the ids. */
export async function getMemberActivity(
  userIds: string[],
): Promise<Record<string, MemberActivity>> {
  const out: Record<string, MemberActivity> = {};
  if (userIds.length === 0) return out;
  const admin = createAdminClient();

  const { data: events } = await admin
    .from("audit_events")
    .select("actor_id, event_type, created_at")
    .in("actor_id", userIds)
    .order("created_at", { ascending: false })
    .limit(20000);

  for (const id of userIds) out[id] = { lastSignIn: null, signIns: 0, lastActive: null };
  for (const e of (events ?? []) as { actor_id: string; event_type: string; created_at: string }[]) {
    const a = out[e.actor_id];
    if (!a) continue;
    if (!a.lastActive) a.lastActive = e.created_at; // rows are newest-first
    if (e.event_type === "login") a.signIns += 1;
  }

  await Promise.all(
    userIds.map(async (id) => {
      const { data } = await admin.auth.admin.getUserById(id);
      out[id].lastSignIn = data?.user?.last_sign_in_at ?? null;
    }),
  );
  return out;
}
