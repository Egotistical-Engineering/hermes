# Cutover runbook: Supabase → Neon + Better Auth

One-time steps to move production onto this branch. Order matters.

## 1. Prepare the Neon database

```bash
# Apply the schema (Neon project: purple-hat-93136417)
psql "$DATABASE_URL" -f server/sql/schema.sql

# Import users + projects from the Supabase backup
DATABASE_URL='postgres://...' node server/scripts/import-from-supabase.mjs ~/hermes-migration-backup
```

Expected result: 396 users, ~397 accounts (110 credential + 287 google), 1,261 projects, 0 orphans.
The script is idempotent — safe to re-run.

## 2. Google OAuth client (console.cloud.google.com, project `hermes-484016`)

Add an authorized redirect URI to the existing "Web Client":

```
https://api.dearhermes.com/api/auth/callback/google
```

(Local dev: also add `http://localhost:3003/api/auth/callback/google`.)
Keep the existing URIs until Supabase is fully decommissioned.

## 3. DNS + Railway domain

- Railway → `hermes-server` service → Settings → Custom Domain → add `api.dearhermes.com`
- DNS: CNAME `api.dearhermes.com` → the Railway-provided target
  (this hostname is free again — the Supabase custom domain that used it is gone)

Same-site cookies between `dearhermes.com` and `api.dearhermes.com` are what
make the Google OAuth redirect hand the session to the frontend.

## 4. Railway environment variables (hermes-server)

Remove: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPABASE_ANON_KEY`

Add:

```
DATABASE_URL=postgres://...          # Neon, with ?sslmode=require
BETTER_AUTH_SECRET=<openssl rand -base64 32>
SERVER_PUBLIC_URL=https://api.dearhermes.com
GOOGLE_CLIENT_ID=914578479750-....apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=<from Google Cloud Console>
```

## 5. Vercel environment variables (hermes project)

- `VITE_CHAT_API_URL=https://api.dearhermes.com` (production)
- Remove `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (no longer read)

Redeploy the frontend after changing.

## 6. Verify

- Existing email/password login (bcrypt hashes carried over — same passwords work)
- Existing Google login (same OAuth client — no new consent screen)
- Fresh signup
- Editor autosave → confirm the row's `pages` updates in Neon
- Assistant chat streams and the conversation persists
- A published essay loads at `/read/:shortId` while signed out

## 7. Afterwards

- All prior sessions are invalid — everyone signs in once. Expected.
- Password reset emails need SMTP wired into `sendResetPassword`
  (server/src/lib/auth.ts) — until then reset links appear in server logs only.
- Keep the Supabase project until Sept 15 (announced date), then delete it
  and remove `.github/workflows/keepalive.yml`.
- The Tauri offline package (`@hermes/offline`) still targets Supabase and
  needs its own pass; native builds run online-only until then.
