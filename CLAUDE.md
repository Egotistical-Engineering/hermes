# Hermes

An AI-guided writing tool that structures your thinking without doing the writing for you. Built on the Dignified Technology design philosophy. React 19, Supabase, Express 5, Anthropic Claude.

## Open Source — Security Rules

This is an **open-source repository**. Every file, commit, and PR is publicly visible. Follow these rules strictly:

- **Never commit secrets**: No API keys, tokens, passwords, DSNs, or credentials in code or config files. All secrets go in `.env` files (which are `.gitignore`d).
- **Never hardcode URLs with credentials**: No Supabase service keys, Sentry DSNs, or third-party tokens inline.
- **Audit before committing**: Before staging files, verify no `.env`, credentials, or private keys are included. If in doubt, ask.
- **Plans and PR descriptions**: Do not include real API keys, passwords, or internal URLs. Use placeholders like `YOUR_API_KEY` or `<redacted>`.
- **Review diffs carefully**: Check `git diff` output for accidental secret leaks before every commit.
- **Environment-specific values**: Always reference env vars (`process.env.X`, `import.meta.env.VITE_X`) — never inline the actual values.

## Quick Start

```bash
# Both frontend (port 5176) + backend (port 3003)
npm run dev

# Or separately:
npm run web:dev      # Frontend only
npm run server:dev   # Backend only
```

## Architecture

**Frontend**: React 19 + Vite 7 + react-router-dom + CSS Modules
**Backend**: Express 5 + Anthropic Claude (`/server/src/`)
**Database**: Supabase (PostgreSQL + Auth)

### Provider hierarchy

```
Sentry.ErrorBoundary → BrowserRouter → AuthProvider → App
```

### Route structure

```
/                       → RedirectToLatestProject (redirects to /projects/:id)
/projects/:projectId    → FocusPage (auth required)
/login                  → LoginPage (standalone login form)
/signup                 → SignupPage (standalone signup form)
/forgot-password        → Redirect to / (forgot password lives in UserMenu dropdown)
/reset-password         → ResetPasswordPage
/auth/confirm           → AuthConfirmPage
*                       → NotFound (404)
```

## Project Structure

```
apps/web/src/
  pages/
    FocusPage/              # Main writing workspace (AI assistant + editor)
  components/
    MarkdownText/           # Markdown rendering component
  contexts/
    AuthContext.jsx          # Auth state management
  hooks/                    # useAuth + data fetching hooks
  styles/                   # Shared CSS primitives (form, dropdown)

packages/
  api/src/writing.ts        # TypeScript interfaces + client API functions
  domain/                   # Shared pure domain utils (relativeTime)

server/src/
  index.ts                  # Express entry (port 3001)
  routes/assistant.ts       # Assistant chat endpoint (SSE streaming with highlights)
  lib/                      # supabase.ts, logger.ts (pino)
  middleware/auth.ts        # JWT verification
```

## API endpoints

**Implemented** (`server/src/routes/assistant.ts`):

- `POST /api/assistant/chat` — contextual assistant chat with inline highlights (SSE)

**Auth** (`server/src/routes/auth.ts`):

- `POST /api/auth/signup` — create user account (email/password, auto-confirmed); stamps `trial_expires_at` (defaults to `FREE_TIER_DAYS`)

**Billing** (`server/src/routes/stripe.ts` + `server/src/routes/usage.ts`):

- `POST /api/stripe/webhook` — Stripe webhook handler (signature-verified, idempotent)
- `POST /api/stripe/portal` — create Stripe Customer Portal session (auth required)
- `GET /api/usage/current` — current user's message usage and plan info (auth required)

### Database tables

All tables linked by `project_id`, owner-scoped via RLS:

- `projects` — `id`, `user_id`, `title`, `status`, `content`, `highlights` (JSONB), timestamps
- `assistant_conversations` — `project_id` (unique), `messages` (JSONB), timestamps
- `user_profiles` — `id` (PK → auth.users), `plan`, `stripe_customer_id`, `stripe_subscription_id`, `subscription_status`, `billing_cycle_anchor`, `cancel_at_period_end`, `current_period_end`, `trial_expires_at`, timestamps
- `message_usage` — `id`, `user_id`, `project_id`, `created_at` (tracks per-message usage for limits)
- `processed_stripe_events` — `event_id` (PK), `event_type`, `processed_at` (webhook idempotency)

## Staging Environment

### Deployed staging

- **Frontend**: `https://staging.dearhermes.com` (Vercel, aliased via CI on every PR)
- **Backend**: Railway `staging` environment (deploys from PR via CI)
- **Supabase**: Separate `hermes-staging` project (us-east-1)

### How staging deploys work

1. Open a PR against `main` → CI runs 5 checks in parallel
2. All checks pass → `deploy-staging` job deploys frontend to Vercel (aliased to `staging.dearhermes.com`) AND server to Railway staging via `railway deployment up`
3. Test on `staging.dearhermes.com` → merge PR → production auto-deploys from `main`

### Running locally against staging

```bash
# Frontend (port 5176, staging Supabase)
npm run web:dev:staging

# Backend (port 3003, staging Supabase) — separate terminal
npm run server:dev:staging
```

### How it works

- **Server**: `DOTENV_CONFIG_PATH=server/.env.staging` tells `dotenv/config` to load staging credentials instead of `server/.env`. Zero source code changes.
- **Frontend**: `vite --mode staging` loads `apps/web/.env.staging` automatically (native Vite behavior).

### Key differences from production

- Frontend and backend MUST target the same Supabase project (auth tokens are project-scoped)
- Vercel Deployment Protection is disabled for Preview (staging is publicly accessible)

## Supabase

### Environment mapping

| Environment | Supabase Project | Project ID |
|---|---|---|
| Local dev (`npm run dev`) | hermes-staging | `jrqajnmudggfyghmyrun` |
| Staging (`npm run dev:staging`) | hermes-staging | `jrqajnmudggfyghmyrun` |
| Vercel preview / `staging.dearhermes.com` | hermes-staging | `jrqajnmudggfyghmyrun` |
| Vercel production / `dearhermes.com` | hermes (production) | `oddczcritnsiahruqqaw` |

Production credentials are **never** stored in local env files. They are only set in Vercel and Railway dashboards.

- **Region**: us-east-1
- **Tables**: `projects`, `assistant_conversations`, `user_profiles`, `message_usage`, `processed_stripe_events`, `invite_codes`, `user_mcp_servers`
- **Migrations**: `supabase/migrations/` (00001 initial, 00002 pages, 00003 publishing, 00004 invite codes, 00005 published pages + subtitle, 00006 subscriptions, 00007 user MCP servers, 00008 security hardening, 00009 audit remediation, 00010 trial codes)
- **RLS**: Owner-scoped — authenticated users can only read/write their own data. Published projects are publicly readable via RLS, but client queries must always filter by `user_id` to avoid leaking published projects into other users' project lists.

### Data conventions

- Database uses `snake_case` columns
- Hooks transform to `camelCase` before passing to components
- API layer accepts `camelCase`, converts back to `snake_case` for writes

## Auth

Email/password or Google OAuth via Supabase Auth. No invite codes required — open signup. `AuthContext` provides `session`, `signIn`, `signOut`. Writing pages are wrapped in `RequireAuth`.

### Signup flow

- **Email/password**: User fills email + password → `POST /api/auth/signup` creates account (auto-confirmed via `admin.createUser()`) → auto-login
- **Google OAuth**: Standard Supabase OAuth flow → usage gate auto-creates profile with `trial_expires_at` on first request

### Free tier and limits

Two tiers: **Pro** (300/month) and **Free** (7 days, 10 messages/day). There is no separate trial tier.

**How it works:**
- On email/password signup, the server stamps `trial_expires_at` on `user_profiles` (defaults to `FREE_TIER_DAYS = 7`)
- Google OAuth users get `trial_expires_at` stamped by the usage gate on first request (falls back to `created_at + FREE_TIER_DAYS`)
- Free users get `FREE_DAILY_LIMIT` (10/day). After `trial_expires_at`, they're locked out (`FREE_EXPIRED`)
- No cron job — expiry is checked lazily on every request
- Limits are defined in `server/src/lib/limits.ts`

**Edge cases:**
- Pro subscription takes priority over free tier (`isPro` checked first)
- Expired free tier: `trial_expires_at` stays as audit trail, user sees upgrade prompt
- Free users do NOT get MCP access (`hasMcpAccess = isPro || isAdmin`)

**Legacy:** The `invite_codes` table and related DB functions still exist but are no longer used by the application.

### Server env vars

```
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
STRIPE_SECRET_KEY=...         # Stripe secret key for billing
STRIPE_WEBHOOK_SECRET=...     # Stripe webhook signing secret
SENTRY_DSN=...                # Error tracking (optional)
LOG_LEVEL=info                # debug, info, warn, error
```

## Styling

CSS Modules for component styles. Global theme tokens via CSS custom properties in `apps/web/src/index.css`. No CSS framework, no Tailwind.

### Shared style primitives

Two shared CSS files in `apps/web/src/styles/` provide reusable base styles via CSS Modules `composes`:

- **`form.module.css`** — `.form`, `.label`, `.input`, `.textarea`, `.actions`, `.cancelBtn`, `.submitBtn`
- **`dropdown.module.css`** — `.menu`, `.item`, `.itemDanger`

When adding new forms or dropdown menus, always `composes` from these primitives and only add component-specific overrides locally.

### Key tokens

```css
--bg-base, --bg-surface, --bg-elevated, --bg-hover
--text-primary, --text-muted, --text-dim
--accent, --border-accent
--border-subtle
--error, --error-bg
--content-padding
```

## DevOps

### CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs 5 parallel jobs on push/PR to main: **typecheck**, **build**, **test**, **server-deploy-check**, **lint**. On PRs, a 6th job **deploy-staging** runs after all checks pass — it deploys frontend to Vercel (aliased to `staging.dearhermes.com`) and server to Railway staging via `railway deployment up`. Uses `.node-version` for consistent Node version.

### Error tracking (Sentry)

- **Frontend**: `@sentry/react` initialized in `main.jsx`. `Sentry.ErrorBoundary` wraps the entire app. Session replay enabled on errors only with `maskAllText: true`.
- **Server**: `@sentry/node` initialized in `index.ts`. Only enabled in production.
- **DSN**: Set via `VITE_SENTRY_DSN` (frontend) and `SENTRY_DSN` (server) env vars.

### Linting

`npm run lint` runs ESLint across the entire monorepo. Config in `eslint.config.js`:
- Frontend (`apps/web/**`): JS/JSX with React hooks + refresh rules
- Server (`server/src/**`): TypeScript with `typescript-eslint`

### Deploy sequence for database migrations

When a PR includes a Supabase migration, follow this order strictly:

1. **Run migration on staging** (`jrqajnmudggfyghmyrun`) first
2. **Test on staging** — verify the feature works end-to-end
3. **Run migration on production** (`oddczcritnsiahruqqaw`) only after staging is verified
4. **Merge the PR** only after production has the schema change applied

Never merge a PR with a migration before the migration has been applied to production. Code that references new columns/tables will break if deployed before the schema exists.

## Common Tasks

### Build check

```bash
npm run web:build
```

Always run after CSS changes to catch broken imports or syntax.

### Adding a component

Create `apps/web/src/components/Name/Name.jsx` and `Name.module.css`. Import CSS module as `styles`. Follow existing patterns.

### Adding a Supabase table

Add a new migration file in `supabase/migrations/`. Include RLS policies: authenticated read/write scoped to owner.

### Adding a new route

Add the route to `apps/web/src/App.jsx`. Wrap in `RequireAuth` if auth is required.

## Gotchas

- Dev server is port **5176** (not 5173)
- Local dev and staging both use **hermes-staging** Supabase — not production
- Email/password signups are **auto-confirmed** via `admin.createUser()` — no email verification needed
- **Client-side Supabase queries on `projects` must always filter by `user_id`** — the "Anyone can read published projects" RLS policy will leak other users' published projects into query results if you don't
- Toast notifications use theme tokens for consistent appearance
- Test dev credentials (email/password) are in `server/.env`

## README Maintenance

When a PR introduces changes that contradict information in `README.md`, update the README as part of the same PR. Keep the README concise — detailed internals belong in CLAUDE.md, not the README.

The README must always reflect the current state of the app. No aspirational features, no references to deleted pages or routes, no planned-but-unbuilt functionality. If a feature doesn't exist yet, it doesn't belong in the README.
