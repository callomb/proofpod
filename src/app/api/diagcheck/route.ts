// TEMPORARY diagnostic route — checks env var health without leaking secrets.
// Delete after use.
export const runtime = "nodejs";

function probe(name: string, v: string | undefined) {
  if (v === undefined) return { name, present: false };
  const bad: { i: number; code: number }[] = [];
  for (let i = 0; i < v.length; i++) {
    const c = v.charCodeAt(i);
    if (c > 255) bad.push({ i, code: c });
  }
  return {
    name,
    present: true,
    length: v.length,
    leadingWhitespace: v !== v.trimStart(),
    trailingWhitespace: v !== v.trimEnd(),
    nonLatin1Chars: bad,
    first6: v.slice(0, 6),
    last6: v.slice(-6),
  };
}

export async function GET() {
  return Response.json({
    NEXT_PUBLIC_SUPABASE_URL: probe("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: probe(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    ),
    SUPABASE_SERVICE_ROLE_KEY: probe(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    NEXT_PUBLIC_SITE_URL: probe("NEXT_PUBLIC_SITE_URL", process.env.NEXT_PUBLIC_SITE_URL),
  });
}
