# Hermes

An AI-guided writing tool that structures your thinking without doing the writing for you. Built on the Dignified Technology design philosophy — AI deepens the creative process rather than replacing it.

## How It Works

Hermes is a multi-page markdown editor with an AI assistant that reads your writing and gives contextual feedback directly on the text.

- **5-tab editor** with focus mode — write in markdown with auto-save to Supabase and localStorage
- **Contextual AI assistant** streams responses via SSE, reading your document in real time
- **Inline highlights** (8 types: question, suggestion, edit, voice, weakness, evidence, wordiness, factcheck) placed directly on your text
- **Accept or dismiss** each highlight, or reply to start a conversation about it
- **Voice consistency** — prior completed essays are passed as context so the AI learns your style over time

## Stack

**Frontend**: React 19, Vite 7, react-router-dom, CSS Modules
**Backend**: Express 5, Anthropic Claude, TypeScript
**Database**: Supabase (PostgreSQL, Auth)
**CI**: GitHub Actions (typecheck, build, test, server deploy check, lint, staging deploy on PRs)
**Observability**: Sentry (error tracking)

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
SUPABASE_ANON_KEY=...

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
/                       → Redirect to latest project
/projects/:projectId    → FocusPage (writing workspace)
/login                  → Redirect to / (login lives in UserMenu dropdown)
/signup                 → Redirect to / (signup lives in UserMenu dropdown)
/forgot-password        → Redirect to / (forgot password lives in UserMenu dropdown)
/reset-password         → Password reset
/auth/confirm           → Email confirmation
```

## Development

```bash
npm run lint            # ESLint across the monorepo
npm run web:build       # Production build check
```
