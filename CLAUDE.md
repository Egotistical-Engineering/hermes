# Hermes

A local-first AI writing tool that structures your thinking without doing the writing for you. BYOK (bring your own key) — users provide their own Anthropic or OpenAI API keys. React 19, Express 5, Tauri 2.

## Open Source — Security Rules

This is an **open-source repository**. Every file, commit, and PR is publicly visible. Follow these rules strictly:

- **Never commit secrets**: No API keys, tokens, passwords, DSNs, or credentials in code or config files. All secrets go in `.env` files (which are `.gitignore`d).
- **Never hardcode URLs with credentials**: No Sentry DSNs or third-party tokens inline.
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

# Native desktop app (Tauri)
npm run native:dev           # Full rebuild (sidecar + Tauri)
npm run native:dev:fast      # Skip sidecar rebuild
npm run native:dev:debugtools  # With DevTools enabled
npm run native:build         # Production build (.app + .dmg)
```

## Architecture

**Frontend**: React 19 + Vite 7 + CSS Modules (no router — single page)
**Backend**: Express 5 + Anthropic SDK + OpenAI SDK (`/server/src/`)
**Native**: Tauri 2 (desktop + mobile) with sidecar server binary
**No database** — all state is local (localStorage / Tauri Store)

### Provider hierarchy

```
Sentry.ErrorBoundary → App → FocusPage
```

No auth, no routing. The app is a single FocusPage.

## Project Structure

```
apps/web/src/
  App.jsx                     # Renders FocusPage + Toaster
  main.jsx                    # Sentry init, StrictMode, ErrorBoundary
  index.css                   # Global theme tokens (CSS custom properties)
  lib/
    settingsStorage.js        # Settings persistence (Tauri Store or localStorage)
    platform.js               # Platform detection (IS_TAURI, IS_MOBILE, IS_DESKTOP, IS_WEB)
    mobileKeyboard.js         # Mobile keyboard helpers for Tauri
  components/
    MarkdownText/             # Markdown rendering component
  pages/
    FocusPage/                # Main writing workspace
      FocusPage.jsx           # TipTap editor + tabs + settings bar
      FocusChatWindow.jsx     # AI assistant chat with model selector
      SettingsPanel.jsx       # API key entry (Anthropic + OpenAI)
      PageTabs.jsx            # 5-tab switcher (Coral, Amber, Sage, Sky, Lavender)
      HighlightPopover.jsx    # Accept/dismiss inline highlights
      LinkTooltip.jsx         # Inline link tooltip
      SourcesPill.jsx         # Source citations display
      useFocusMode.js         # Focus mode state
      useHighlights.js        # Highlight management
      useInlineLink.js        # Link handling
  styles/                     # Shared CSS primitives (form, dropdown)

apps/native/src-tauri/
  src/lib.rs                  # Tauri setup: sidecar spawn, devtools toggle, cleanup
  tauri.conf.json             # App config, CSP, sidecar declaration
  binaries/                   # Built sidecar binary (hermes-server-{target})

packages/
  api/src/
    index.ts                  # Exports types + welcome seed content
    writing.ts                # TypeScript interfaces (WritingProject, Highlight, etc.)
    welcome-seed.ts           # Welcome content for new users

server/src/
  index.ts                    # Express entry (port 3003, host 127.0.0.1)
  env.ts                      # Dotenv loader
  routes/assistant.ts         # POST /api/assistant/chat (SSE streaming)
  lib/logger.ts               # Pino logger
  types/express.d.ts          # TypeScript augmentation

scripts/
  build-sidecar.mjs           # Bundles server → standalone binary via esbuild + pkg
```

## API Endpoint

Single endpoint — `POST /api/assistant/chat` (`server/src/routes/assistant.ts`)

**Accepts** (JSON body):
- `message` — user's message text
- `pages` — record of page contents (keyed by tab name)
- `activeTab` — current editor tab
- `provider` — `"anthropic"` or `"openai"`
- `model` — model ID (e.g. `claude-sonnet-4-6`, `gpt-4o`)
- `apiKey` — user's API key for the selected provider
- `conversationHistory` — last 30 messages

**Returns** SSE stream with events: `text`, `highlight`, `source`, `tool_status`, `done`, `error`

**Tools available to the AI**: `add_highlight` (inline text annotations), `cite_source` (source references)

The server is **stateless** — no database, no auth, no session management. API keys are passed per-request from the client.

## Settings & API Keys (BYOK)

Users bring their own API keys. Settings are stored locally:

- **Web**: `localStorage` under key `hermes-settings`
- **Native (Tauri)**: `tauri-plugin-store` for persistent secure storage, with localStorage fallback

Settings object shape:
```json
{
  "anthropicApiKey": "sk-ant-...",
  "openaiApiKey": "sk-...",
  "model": "claude-sonnet-4-6"
}
```

The `settingsStorage.js` module provides async `loadSettings()` and `saveSettings()` that abstract the Tauri Store / localStorage difference.

### Model selection

The model selector lives in `FocusChatWindow.jsx` (bottom of chat input area). Available models:
- **Anthropic**: Sonnet 4.6, Haiku 4.5, Opus 4.6
- **OpenAI**: GPT-4o, GPT-4o Mini

Provider is derived from the model — `claude-*` models use the Anthropic key, others use OpenAI. The correct API key is automatically selected per-request.

## Native App (Tauri)

### How it works

1. Tauri launches and spawns the `hermes-server` sidecar binary
2. The sidecar is a standalone Node 20 executable (built with esbuild + pkg)
3. The sidecar listens on `127.0.0.1:3003`
4. The WebView loads the frontend, which makes requests to the sidecar
5. On app close, the sidecar process is killed

### CORS

The server allows these origins:
- `http://localhost:5176` (web dev)
- `tauri://localhost` (Tauri WebView)
- `https://tauri.localhost`
- Any `localhost` / `127.0.0.1` origin

### CSP

Configured in `tauri.conf.json`. `connect-src` must include `http://127.0.0.1:3003`, `http://localhost:3003`, `ipc://localhost`, and the AI provider APIs.

### DevTools

DevTools are behind a Cargo feature flag (`debug-tools`). Use `npm run native:dev:debugtools` to enable. The SettingsPanel has a "Toggle DevTools" button in Tauri builds.

### Sidecar build

`scripts/build-sidecar.mjs`:
1. Bundles `server/src/index.ts` → single CJS file with esbuild
2. Compiles to standalone binary with `@yao-pkg/pkg` (Node 20)
3. Names as `hermes-server-{target-triple}` and places in `apps/native/src-tauri/binaries/`

## Styling

CSS Modules for component styles. Global theme tokens via CSS custom properties in `apps/web/src/index.css`. No CSS framework, no Tailwind.

### Key tokens

```css
--bg-base, --bg-surface, --bg-elevated, --bg-hover
--text-primary, --text-muted, --text-dim
--accent, --border-accent
--border-subtle
--error, --error-bg
--content-padding
```

### Shared style primitives

Two shared CSS files in `apps/web/src/styles/`:

- **`form.module.css`** — `.form`, `.label`, `.input`, `.textarea`, `.actions`, `.cancelBtn`, `.submitBtn`
- **`dropdown.module.css`** — `.menu`, `.item`, `.itemDanger`

## Server Env Vars

```
HOST=127.0.0.1               # Bind address (default: 127.0.0.1)
PORT=3003                     # Port (default: 3003)
FRONTEND_URL=...              # Allowed CORS origin (default: http://localhost:5176)
SENTRY_DSN=...                # Error tracking (optional)
LOG_LEVEL=info                # debug, info, warn, error
NODE_ENV=development          # development or production
```

No API keys in server env — they come from the client per-request.

## DevOps

### CI

GitHub Actions workflow (`.github/workflows/ci.yml`) runs parallel jobs on push/PR to main: **typecheck**, **build**, **test**, **server-deploy-check**, **lint**. Uses `.node-version` for consistent Node version.

### Error tracking (Sentry)

- **Frontend**: `@sentry/react` initialized in `main.jsx`. `Sentry.ErrorBoundary` wraps the entire app.
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

## Gotchas

- Dev server is port **5176** (not 5173)
- Backend binds to **127.0.0.1:3003** by default
- Native app uses `tauri://localhost` origin — server CORS must allow it
- Tauri DevTools require the `debug-tools` Cargo feature flag
- The sidecar binary must be rebuilt when server code changes (`npm run build:sidecar`)
- `pkg` warnings during sidecar build ("Cannot resolve 'mod'", "Malformed requirement") are harmless
- Bundle identifier `com.dearhermes.app` ends with `.app` — macOS warns about this (cosmetic, not blocking)
- Settings storage is async (Tauri Store) — use `await loadSettings()` / `await saveSettings()`

## README Maintenance

When a PR introduces changes that contradict information in `README.md`, update the README as part of the same PR. Keep the README concise — detailed internals belong in CLAUDE.md, not the README.

The README must always reflect the current state of the app. No aspirational features, no references to deleted pages or routes, no planned-but-unbuilt functionality. If a feature doesn't exist yet, it doesn't belong in the README.
