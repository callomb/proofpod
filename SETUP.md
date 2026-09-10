# ProofPod — setup

A Next.js 16 + Supabase web app. Mobile-first. ~15 minutes to a running beta.

---

## 1. Create the Supabase project

1. Go to <https://supabase.com/dashboard> → **New project**.
2. Name it `proofpod`, choose a region close to your users (e.g. London), set a
   database password (save it somewhere).
3. Wait for it to finish provisioning.

## 2. Run the database schema

In the Supabase dashboard → **SQL Editor** → **New query**:

1. Paste the entire contents of [`supabase/migrations/0001_initial_schema.sql`](supabase/migrations/0001_initial_schema.sql) and **Run**.
2. New query again — paste [`supabase/migrations/0002_storage.sql`](supabase/migrations/0002_storage.sql) and **Run**.

You should now have tables under **Table Editor** and two buckets
(`evidence`, `branding`) under **Storage**.

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

1. **Create account** → enter your name + company name → you're in.
2. On the home screen, tap the **avatar (top right) → More → Load demo projects**
   to get Lisbon House / Portman House / Anglia Way with sample tests. (Optional.)
3. Walk the flow: pick a project → **New test** → floor / system / area →
   start a stage → for the **Pressure Test** stage the camera opens first, then
   the timestamp is recorded → **Complete** → **Pass** / **Fail** → **Retest**.

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

## Inviting the team

**More → Team → Create invite link.** Send the link (WhatsApp, text, email).
The recipient opens it, sets a password, and lands in your company. No email
server needed.

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
