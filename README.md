# ProofPod

Ultra-simple evidence capture for construction. **Beta: plumbing pressure testing.**

Plumbers pressure test their work — the evidence is the weak point. ProofPod makes
recording a test faster than not recording it. It captures *what happened*: who,
when, how long, with photos. It does not police plumbing standards or judge
methodology.

## Stack

- **Next.js 16** (App Router, Turbopack) + React 19 + TypeScript
- **Tailwind CSS v4** — monochrome design system, mobile-first
- **Supabase** — Postgres, Auth, Storage, Row Level Security
- Deploy target: **Vercel**

## Getting started

See **[SETUP.md](SETUP.md)** — Supabase project, schema, env vars, run, deploy.

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

## Shape of the data

```
company ──< company_members >── auth user (profile)
company ──< projects ──< pressure_tests ──< test_stages
                                        └──< test_photos
company ──< test_profiles           (default stage pressures / durations)
company ──< audit_events            (provenance trail)
```

- **projects**: `active` / `archived`. Quick-create needs only a name.
- **pressure_tests**: `in_progress` / `passed` / `failed` / `void`. Three
  independent stages (`initial`, `strength`, `pressure`) — none are required, no
  enforced order. Six pressure/duration values are snapshotted per test.
- **passed ⇒ locked**: immutable. Changes go through **retest** (`retest_of`).
- All writes that record state go through `SECURITY DEFINER` RPCs
  (`start_stage`, `complete_stage`, `set_test_result`, `void_test`,
  `create_retest`, …) so timestamps are DB-authoritative and every event is
  written to `audit_events` in the same transaction.
- **RLS**: every table is scoped to the caller's company via
  `user_company_ids()`. One company can never see another's data.

## Key files

| Path | What |
| --- | --- |
| `supabase/migrations/` | Schema, RLS, RPCs, storage buckets/policies |
| `src/lib/supabase/` | Browser / server / admin / proxy clients |
| `src/lib/data.ts` | Server-side reads |
| `src/lib/actions.ts` | Server actions (thin wrappers over RPCs) |
| `src/lib/domain.ts` | Floors, systems, formatting, status meta |
| `src/proxy.ts` | Session refresh + route gating (Next 16 `proxy` convention) |
| `src/app/(app)/` | Authenticated app (home, projects, tests, more) |

## Not in the beta (deliberately)

Native apps, offline mode, granular permissions, billing, PDF certificate engine,
witness signatures, project merging, analytics dashboards, compliance checks.
The schema leaves room for certificates, selective certificates, and witnesses.
