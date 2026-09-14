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
- **@react-pdf/renderer** — certificate PDF generation (Node runtime)
- Deploy target: **Vercel**

## Two surfaces

- **Site** (`/home`, mobile-first) — the plumber: pick a project, create and
  perform tests, capture evidence, pass/fail, retest.
- **Admin portal** (`/admin`, responsive) — the office: projects, project &
  company test settings, users, and certificate generation.

Roles: `admin` and site user (`member`). The company creator is an admin.

## Getting started

See **[SETUP.md](SETUP.md)** — Supabase project, schema, env vars, run, deploy.

```bash
npm install
cp .env.example .env.local   # fill in Supabase keys
npm run dev
```

## Shape of the data

```
company ──< company_members >── auth user (profile)   (role, status)
company ──< company_invites                            (name + role, shareable link)
company ──< projects ──< pressure_tests ──< test_stages
          │                             └──< test_photos
          │                             └──< certificate_tests >── certificates
          ├──< test_profiles            (default stage pressures / durations)
          └──< audit_events             (provenance trail)
```

- **projects**: `active` / `archived`. Quick-create needs only a name. Test
  settings resolve **company default → project override → per-test values**.
- **pressure_tests**: `in_progress` / `passed` / `failed` / `void`. Three
  independent stages (`initial`, `strength`, `pressure`) — none are required, no
  enforced order. Six pressure/duration values are snapshotted per test.
- **passed ⇒ locked**: immutable. Changes go through **retest** (`retest_of`).
  Admins may correct identifying fields (floor/system/area) on an *in-progress* test.
- **certificates**: issued via `issue_certificate()`, which freezes an immutable
  `snapshot` (jsonb) of company/project/tests/stages/photos in-transaction and
  assigns `PPC-000001`. The PDF is rendered from the snapshot and stored in the
  private `certificates` bucket; re-download serves the stored file.
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
| `src/lib/data.ts` | Server-side reads (`getWorkspace`, `requireAdmin`, …) |
| `src/lib/actions.ts` | Server actions (thin wrappers over RPCs) |
| `src/lib/certificate-pdf.tsx` | PDF layout (`renderCertificatePdf`) |
| `src/lib/certificate-actions.ts` | Issue → render → store |
| `src/lib/domain.ts` | Floors, systems, formatting, status meta |
| `src/proxy.ts` | Session refresh + route gating (Next 16 `proxy` convention) |
| `src/app/(app)/` | Site app (home, projects, tests, more) |
| `src/app/admin/` | Admin portal |

## Not in the beta (deliberately)

Native apps, offline mode, granular permissions / custom roles, billing,
witness & digital signatures, emailing certificates, client portals, project
merging, analytics dashboards, notifications, compliance checks. The schema
leaves room for selective certificates and witnesses.
