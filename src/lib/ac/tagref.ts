import "server-only";

export interface TagrefAsset {
  assetId: string;
  reference: string | null;
  area: string | null;
}

const TAGREF_URL = /^https?:\/\/(?:www\.)?tagref\.co\.uk\/a\/(\d+)\/?(?:[?#].*)?$/i;

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
 * Reads the public Tagref asset page behind a scanned QR label. Only ever
 * fetches tagref.co.uk/a/<digits> (never an arbitrary scanned URL). Returns
 * null for anything unexpected — unknown asset, network failure, or a page
 * layout change — so the caller falls back to manual entry.
 */
export async function lookupTagrefAsset(scanned: string): Promise<TagrefAsset | null> {
  const match = scanned.trim().match(TAGREF_URL);
  if (!match) return null;
  const assetId = match[1];

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
