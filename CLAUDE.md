# Hermes

An AI-guided writing tool that structures your thinking without doing the writing for you. Built on the Dignified Technology design philosophy. React 19, Supabase, Express 5, Anthropic Claude.

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

## Writing Workflow System

Six-stage pipeline where the AI structures thinking but never does the final writing.

### Status machine

`interview` → `draft` → `rewriting` → `feedback` → `complete`

Transitions are explicit via `POST /api/writing/status`. Each stage is persisted in `projects.status`.

### API endpoints

**Implemented** (`server/src/routes/assistant.ts`):

- `POST /api/assistant/chat` — contextual assistant chat with inline highlights (SSE)

**Planned** (to be built in `server/src/routes/writing.ts`):

- `POST /api/writing/status` — advance project status (`{ projectId, status }`)
- `POST /api/writing/interview/stream` — streaming interview chat (SSE)
- `POST /api/writing/interview/outline` — generate structured outline from interview
- `POST /api/writing/draft/stream` — generate skeleton draft from brain dump + outline + prior context (SSE)
- `POST /api/writing/feedback/stream` — generate feedback on rewrite without rewriting for the user (SSE)
- `POST /api/writing/tools/:tool` — inline coaching tools: `expand`, `challenge`, `restructure` (SSE, accepts selected text)

### Database tables

All tables linked by `project_id`, owner-scoped via RLS:

- `projects` — `id`, `user_id`, `title`, `status`, `content`, `highlights` (JSONB), timestamps
- `brain_dumps` — `id`, `project_id`, `content` (raw text), `prior_essays` (JSONB)
- `interviews` — `id`, `project_id`, `messages` (JSONB array), `outline` (generated text)
- `drafts` — `id`, `project_id`, `version`, `skeleton` (AI-generated), `rewrite` (user's text)
- `feedback` — `id`, `project_id`, `draft_id`, `content` (AI critique)
- `assistant_conversations` — `project_id` (unique), `messages` (JSONB), timestamps

### Design details

- All AI outputs stream via SSE (interview, draft, feedback, inline tools)
- Draft versioning: "start new version" promotes current rewrite to next skeleton draft
- Three inline tools during rewrite: select text → expand / challenge / restructure
- Prior completed projects are passed as context for voice/style consistency
- Interview uses one-question-at-a-time format to keep conversation focused

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

- **Project ID**: Set in your Supabase dashboard (see `.env`)
- **Region**: us-east-1
- **Tables**: `projects`, `brain_dumps`, `interviews`, `drafts`, `feedback`, `assistant_conversations`
- **Migration**: Single file at `supabase/migrations/00001_initial_schema.sql`
- **RLS**: Owner-scoped — authenticated users can only read/write their own data

### Data conventions

- Database uses `snake_case` columns
- Hooks transform to `camelCase` before passing to components
- API layer accepts `camelCase`, converts back to `snake_case` for writes

## Auth

Email/password via Supabase Auth. `AuthContext` provides `session`, `signIn`, `signOut`. Writing pages are wrapped in `RequireAuth`.

### Server env vars

```
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...
SUPABASE_ANON_KEY=...
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
- Supabase email confirmation is **enabled** — users must click the confirmation link before logging in
- Toast notifications use theme tokens for consistent appearance
- Test dev credentials (email/password) are in `server/.env`

## README Maintenance

When a PR introduces changes that contradict information in `README.md`, update the README as part of the same PR. Keep the README concise — detailed internals belong in CLAUDE.md, not the README.

The README must always reflect the current state of the app. No aspirational features, no references to deleted pages or routes, no planned-but-unbuilt functionality. If a feature doesn't exist yet, it doesn't belong in the README.
