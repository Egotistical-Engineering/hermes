# Hermes

Hermes is a local-first writing app with an AI assistant.
You write in a 5-tab markdown editor, then get streamed chat feedback plus inline highlights.

Current model is bring-your-own-key:
- Users add their own Anthropic/OpenAI API keys in app Settings.
- Keys are saved locally on-device.
- The local assistant server runs on `127.0.0.1:3003`.

## Architecture

- `apps/web`: React + Vite frontend.
- `server`: Express SSE assistant API.
- `apps/native/src-tauri`: Tauri shell that launches the backend as a sidecar.
- `packages/api`: shared welcome seed data and shared types.
- `supabase`: SQL migrations and email templates for hosted Supabase setup.
- `vercel.json` + `middleware.js`: Vercel deploy config and OG middleware for `/read/*`.

## Prerequisites

- Node.js `22` (see `.node-version`)
- npm (comes with Node)
- Rust + Cargo (required for Tauri native builds)

Install Rust/Cargo with rustup:

```bash
# macOS / Linux
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source "$HOME/.cargo/env"

# verify
rustc --version
cargo --version
```

Windows PowerShell:

```powershell
winget install Rustlang.Rustup
rustup-init.exe
rustc --version
cargo --version
```

For full Tauri platform requirements (Xcode/CLT on macOS, WebView dependencies on Linux, etc.), see:
[Tauri v2 Prerequisites](https://v2.tauri.app/start/prerequisites/)

## Install

```bash
npm install
```

## Environment Variables

Server env file: `server/.env`

```bash
# optional
FRONTEND_URL=http://localhost:5176
HOST=127.0.0.1
PORT=3003
LOG_LEVEL=info

# optional observability
SENTRY_DSN=
NODE_ENV=development
```

Notes:
- No provider key is required in server env for normal use.
- The frontend sends user-provided provider keys per request.

For Vercel middleware/OG behavior, set these in Vercel project env:

```bash
SUPABASE_URL=
SUPABASE_ANON_KEY=
# or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
```

## Run (Web + Local Server)

```bash
npm run dev
```

This starts:
- web at `http://localhost:5176`
- server at `http://127.0.0.1:3003`

In the app:
1. Open Settings (gear).
2. Add Anthropic and/or OpenAI key.
3. Select model and start chatting.

## Run Native Desktop (Tauri)

```bash
# normal native dev
npm run native:dev

# native dev with devtools feature enabled
npm run native:dev:debugtools
```

DevTools behavior:
- Disabled in normal/release builds.
- Available in `debug-tools` builds via Settings -> `Toggle DevTools (Debug)`.

## Build Native Artifacts

```bash
npm run native:build
```

This builds:
- Sidecar binary from `server` into `apps/native/src-tauri/binaries/`
- Native app bundle via Tauri

Output (macOS example):
- `apps/native/src-tauri/target/release/bundle/macos/Hermes.app`

If DMG packaging fails in your environment, you can still ship the `.app` or create DMG manually with `hdiutil`.

## Quality Checks

```bash
npm run lint
npm run server:typecheck
npm run web:build
```

## Supabase Folder

`supabase/` contains:
- `migrations/*.sql`: schema/history scripts
- `templates/*.html`: auth email templates

The app can run locally without applying these migrations, but you need them if you are operating your own hosted Supabase backend and publishing flow.

## Vercel Files

- `vercel.json`: build/output/rewrites for deploying the web app.
- `middleware.js`: serves bot-specific OG HTML for `/read/*` routes by querying published content from Supabase REST.

## Distribution Notes

- Do not commit build artifacts (`.app`, `.dmg`, `target/`, sidecar binaries) to git.
- Publish installers as GitHub Release assets.
