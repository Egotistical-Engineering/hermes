# Hermes

An AI-guided writing tool that structures your thinking without doing the writing for you. Built on the Dignified Technology design philosophy — AI deepens the creative process rather than replacing it.

## How It Works

Hermes walks you through a multi-stage workflow to go from raw ideas to a finished essay:

1. **Interview** — Hermes asks probing questions one at a time, clarifying your thesis and challenging weak reasoning.
2. **Skeleton Draft** — The AI generates scaffolding from your brain dump and interview — not your essay, but something to react against.
3. **Rewrite** — You rewrite the skeleton in your own words. Inline coaching tools are available on selected text: *Expand*, *Challenge*, *Restructure*.
4. **Feedback** — The AI critiques your rewrite — highlighting strengths, surfacing questions, pointing to areas that could be stronger. It never rewrites for you.
5. **Complete** — Your final draft is ready. Start a new version at any point during rewriting to continue iterating.

A contextual assistant lives alongside the editor, providing inline highlights (questions, suggestions, edits, voice checks, weakness flags, evidence gaps, wordiness, fact-checks) directly on your text.

Prior completed projects are passed as context so the AI learns your voice and style over time.

## Stack

**Frontend**: React 19, Vite 7, react-router-dom, CSS Modules
**Backend**: Express 5, Anthropic Claude, TypeScript
**Database**: Supabase (PostgreSQL, Auth)
**CI**: GitHub Actions (typecheck, build, test, server deploy check, lint)
**Observability**: Sentry (error tracking), Plausible (analytics)

## Setup

```bash
npm install

# Web app (apps/web/.env.local)
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_CHAT_API_URL=http://localhost:3003

# Server (server/.env)
ANTHROPIC_API_KEY=...
SUPABASE_URL=...
SUPABASE_SERVICE_KEY=...

# Run both (web on 5176, server on 3003)
npm run dev

# Or separately
npm run web:dev      # Frontend only
npm run server:dev   # Backend only
```

## Project Structure

```
apps/web/src/
  pages/
    FocusPage/              # Main writing workspace (assistant + editor)
    LoginPage/              # Login
    SignupPage/             # Signup
    ForgotPasswordPage/     # Password reset request
    ResetPasswordPage/      # Password reset
    AuthConfirmPage/        # Email confirmation handler
  components/
    MarkdownText/           # Markdown rendering
  contexts/
    AuthContext.jsx          # Auth state (session, signIn, signOut)
  hooks/                    # useAuth + data fetching
  styles/                   # Shared CSS primitives (form, dropdown)

packages/
  api/                  # Shared API layer (Supabase + server endpoints)
  domain/               # Shared pure domain utils

server/src/
  index.ts              # Express entry point
  routes/assistant.ts   # Assistant chat endpoint (SSE streaming with highlights)
  lib/                  # Supabase client, logging (pino)
  middleware/auth.ts    # JWT verification
```

## Routes

```
/                       → Redirect to latest project (or freeform editor if not logged in)
/projects/:projectId    → FocusPage (writing workspace)
/login                  → Login
/signup                 → Signup
/forgot-password        → Password reset request
/reset-password         → Password reset
/auth/confirm           → Email confirmation
```

## Development

```bash
npm run lint            # ESLint across the monorepo
npm run web:build       # Production build check
```
