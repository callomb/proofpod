import "server-only";

import { createAdminClient } from "../supabase/admin";

export interface TagrefAsset {
  assetId: string;
  reference: string | null;
  area: string | null;
}

const TAGREF_URL = /^https?:\/\/(?:www\.)?tagref\.co\.uk\/a\/(\d+)\/?(?:[?#].*)?$/i;

const DETAIL_TABLE: Record<string, { table: string; column: string }> = {
  asset_tag: { table: "tagref_asset_tag_details", column: "reference" },
  valve: { table: "tagref_valve_details", column: "reference" },
  electrical: { table: "tagref_electrical_details", column: "reference" },
  fgas: { table: "tagref_fgas_details", column: "system_id" },
};

/** Looks the asset up in the shared database (Tagref's tables live alongside ProofPod's). */
async function lookupInDatabase(assetId: string): Promise<TagrefAsset | null> {
  const admin = createAdminClient();
  const { data: asset } = await admin
    .from("tagref_assets")
    .select("label_type, area")
    .eq("asset_id", assetId)
    .maybeSingle<{ label_type: string; area: string | null }>();
  if (!asset) return null;

  let reference: string | null = null;
  const detail = DETAIL_TABLE[asset.label_type];
  if (detail) {
    const { data } = await admin
      .from(detail.table)
      .select(detail.column)
      .eq("asset_id", assetId)
      .maybeSingle<Record<string, string | null>>();
    reference = data?.[detail.column] ?? null;
  }
  return { assetId, reference, area: asset.area };
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Fallback for assets created in the old Tagref database before it was merged
 * into this one: reads the public Tagref page. Can be removed once the old
 * Tagref is fully switched over.
 */
async function lookupFromPublicPage(assetId: string): Promise<TagrefAsset | null> {
  try {
    const res = await fetch(`https://www.tagref.co.uk/a/${assetId}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const html = await res.text();
    const rows = new Map<string, string>();
    for (const m of html.matchAll(/<div class="result-row"><span>([^<]*)<\/span><span>([^<]*)<\/span><\/div>/g)) {
      rows.set(decodeEntities(m[1]).toLowerCase(), decodeEntities(m[2]));
    }
    const reference = rows.get("reference") || null;
    const area = rows.get("area") || null;
    if (!reference && !area) return null;
    return { assetId, reference, area };
  } catch {
    return null;
  }
}

/**
 * Finds a scanned Tagref QR label's reference + area. Only ever acts on
 * tagref.co.uk/a/<digits> links. Returns null for anything unexpected so the
 * caller falls back to manual entry.
 */
export async function lookupTagrefAsset(scanned: string): Promise<TagrefAsset | null> {
  const match = scanned.trim().match(TAGREF_URL);
  if (!match) return null;
  const assetId = match[1];
  try {
    return (await lookupInDatabase(assetId)) ?? (await lookupFromPublicPage(assetId));
  } catch {
    return lookupFromPublicPage(assetId);
  }
}
