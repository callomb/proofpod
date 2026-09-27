# ProofPod — setup

A Next.js 16 + Supabase web app. Mobile-first. ~15 minutes to a running beta.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it `proofpod`, choose a region close to your users (e.g. London), set a
   database password (save it somewhere).
3. Wait for it to finish provisioning.

## 2. Run the database schema

**Preferred: the Supabase CLI.** It's already a project dependency (`npx supabase`),
so no separate install needed.

1. Generate a personal access token at
   [supabase.com/dashboard/account/tokens](https://supabase.com/dashboard/account/tokens)
   — scope it to this one **Project**, with **Database** access (Migrations at
   least Read-write). No expiration needed.
2. Add it to `.env.local` as `SUPABASE_ACCESS_TOKEN` (see `.env.example`).
3. Link and push:
   ```bash
   npx supabase link --project-ref YOUR-PROJECT-ref
   npx supabase db push
   ```
   This applies every file in `supabase/migrations/` in order, and tracks what's
   already applied so re-running it later only pushes new ones.

**Fallback: the SQL Editor.** Dashboard → **SQL Editor** → **New query**, paste
one migration file, Run, then New query for the next — in order, starting from
`0001_initial_schema.sql`. Only needed if you can't use the CLI for some reason.

Either way, you should end up with tables under **Table Editor** and three
buckets (`evidence`, `branding`, `certificates`) under **Storage**.

## 3. Turn off email confirmation (for the beta)

Dashboard → **Authentication** → **Sign In / Providers** → **Email**:

- Turn **Confirm email** *off*. (Plumbers sign up and are straight in. You can
  turn it back on later.)

Dashboard → **Authentication** → **URL Configuration**:

- **Site URL**: `http://localhost:3000` for now (change to your real domain after deploy).
- Add `http://localhost:3000/**` and your production URL to **Redirect URLs**.

## 4. Get your keys

Dashboard → **Project Settings** → **API**:

| Value | Env var |
| --- | --- |
| Project URL | `NEXT_PUBLIC_SUPABASE_URL` |
| `anon` `public` key | `NEXT_PUBLIC_SUPABASE_ANON_KEY` |
| `service_role` `secret` key | `SUPABASE_SERVICE_ROLE_KEY` |

Put them in `.env.local` (copy from `.env.example`):

```bash
cp .env.example .env.local
# then edit .env.local
```

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

## 5. Run it

```bash
npm install
npm run dev
```

Open <http://localhost:3000> on your phone (same Wi-Fi, use your Mac's IP) or in
a browser with device emulation.

1. **Create account** → enter your name + company name → you land in the admin portal.
2. **Site view** (portal header) → **More → Load demo projects** for sample data. (Optional.)
3. Site flow: pick a project → **New test** → floor / system / area → start a stage
   → for the **Pressure Test** stage the camera opens first, then the timestamp is
   recorded → **Complete** → **Pass** / **Fail** → **Retest**.
4. Admin flow: **Projects** → open one → inspect a passed test's evidence →
   **Certificates** tab → tick it → **Generate certificate** → **Download**.

---

## 6. Deploy (Vercel)

1. Push this repo to GitHub.
2. <https://vercel.com/new> → import the repo → framework auto-detects **Next.js**.
3. Add the same four env vars (set `NEXT_PUBLIC_SITE_URL` to your Vercel URL).
4. Deploy.
5. Back in Supabase → **Authentication → URL Configuration**: set **Site URL** and
   add a **Redirect URL** for the Vercel domain (`https://your-app.vercel.app/**`).

That's the beta live.

---

## Roles

Two roles. The person who signs the company up is an **Admin**.

- **Admin** — the `/admin` portal: projects, project details, project/company test
  settings, users, and certificate generation. Lands on `/admin/projects` at sign-in.
- **Site user** — the mobile flow only: active projects, create and perform tests,
  capture evidence, pass/fail, retest. Lands on `/home`.

An admin can also open the mobile "Site view" from the portal header.

## Inviting the team

**Admin portal → Users → Invite a user** (name, optional email, role). Send the
link (WhatsApp, text, email). The recipient opens it, sets a password, and lands
in your company. No email server needed.

Deactivating a user removes their access immediately but keeps their name on every
test they performed.

## Certificates

Admin portal → open a project → **Certificates** tab. Tick one or more **passed**
tests → **Generate certificate**. A PDF is produced (company header + logo,
project info, certificate number `PPC-000001`, and one page of stage/photo
evidence per test) and stored privately. It appears under **Issued certificates**
with a Download link.

An issued certificate is frozen — editing the project afterwards does not change
certificates already issued. Add a company address and logo under **Company
settings** so they appear on the PDF.

## How company / project / test settings relate

- **Company default test values** (More → Company) seed every new test.
- A **project** can point at a different profile later (schema supports
  `projects.test_profile_id`; no UI in the beta).
- Each **test** carries its own six values, copied at creation. The **gear icon**
  on the test screen edits *that test only* — company defaults are untouched.

## Immutability

- A **passed** test is locked: stages, photos and settings can't be changed.
  If something changes on site, use **Retest** (creates a new linked record).
- Nothing is deleted. Projects are **archived**; tests are **voided**. Both keep
  the record and the audit trail (`audit_events` table).
