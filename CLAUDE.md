@AGENTS.md

# ProofPod

Evidence capture for construction. Beta = plumbing pressure testing. See README.md
and SETUP.md.

## Product rules that must not be broken

- **Record what happened. Never judge methodology.** No warnings for skipped
  stages, no auto pass/fail, no auto-ending tests, no compliance checks.
- **Least friction for the site user.** The plumber tells us: where (floor),
  what system, what area — then presses buttons. Everything else (user,
  timestamps, company, durations, IDs) is automatic.
- **Passed = locked = immutable.** Changes happen via **retest** (new record,
  `retest_of` link). Projects archive, tests void — nothing is deleted.
- **The three stages are independent.** No enforced order. A plumber can do only
  the Pressure Test.
- **Pressure Test stage requires a photo before the timestamp** — camera opens,
  photo saves, *then* start/end time is recorded. This links photo ↔ time.
- Company default test values → copied onto each test at creation → the test's
  gear icon edits that test only.

## Admin portal & certificates

- Two roles: `admin` and site user (`member`). `getWorkspace()` returns
  `isAdmin`; `requireAdmin()` redirects site users to `/home`. Deactivated
  members (`company_members.status='inactive'`) redirect to `/deactivated`.
- Test-setting hierarchy: company `test_profiles` default → `projects` override
  columns (`override_test_profile` + 6 values) → per-test snapshot at creation.
  `create_test` resolves this.
- Certificates are immutable: `issue_certificate(project_id, test_ids[])` freezes
  a jsonb `snapshot` in-transaction and assigns `PPC-000001` from a sequence.
  `certificate-actions.ts` then renders the PDF (`certificate-pdf.tsx`, Node
  runtime, `@react-pdf/renderer`) and stores it in the private `certificates`
  bucket. Re-download serves the stored file; regenerates from snapshot only if
  missing. Never regenerate a certificate from current project data.
- Only `passed` tests are certifiable. Empty stage sections and signature boxes
  must never appear on the PDF.

## Architecture notes

- Next.js 16: `proxy.ts` (not `middleware.ts`), async `params`/`searchParams`/
  `cookies()`, Turbopack. `PageProps<>` / `LayoutProps<>` are generated — run
  `npx next typegen` after adding routes.
- State-changing writes go through Postgres `SECURITY DEFINER` RPCs in
  `0001_initial_schema.sql`, which also write `audit_events`. Server actions in
  `src/lib/actions.ts` are thin wrappers.
- RLS everywhere via `public.user_company_ids()`. Never add a table without a
  company-scoped policy.
- Evidence photos: private `evidence` bucket, path
  `<company_id>/<project_id>/<test_id>/<uuid>.<ext>`; displayed via service-role
  signed URLs (`signEvidenceUrls`).

## Commands

```
npm run dev            # Turbopack dev server
npm run build          # production build
npx tsc --noEmit       # typecheck
npx eslint .           # lint
```
