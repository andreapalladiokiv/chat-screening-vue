# Chat View

A single-page web application for reviewing AI chat conversations stored in Supabase. Presents sessions in a WhatsApp-style interface with per-session and per-message feedback, server-side filtering, and role-based access control.

The repo is mid-rewrite: the production frontend currently lives in [`legacy/`](legacy/) (vanilla JS / HTML / CSS, zero build), and a Vue 3 + Vite + TypeScript replacement is being built at the root per [`docs/architecture/review-2026-05.md`](docs/architecture/review-2026-05.md). Both versions run side by side during the cutover.

## Stack

| Layer | Legacy (`legacy/`) | Vue rewrite (root) |
|---|---|---|
| Frontend | Vanilla JS, HTML, CSS (zero build) | Vue 3 + Vite + TypeScript + Pinia + Vue Router |
| Database | Supabase (PostgreSQL) with RPCs | Same — backend is a fixed contract |
| Backend | Supabase Edge Functions (Deno/TS) | Same |
| Auth | Google OAuth via Supabase Auth | Same |

## Quick Start

1. Create `legacy/config.js` (legacy) and `.env.local` from `.env.example` (Vue) with your Supabase credentials. See `CLAUDE.md` for both formats.
2. Run the SQL migrations in `supabase/migrations/`.
3. Deploy Edge Functions: `supabase functions deploy chat-feedback` and `supabase functions deploy invite-user`.
4. Bring up both versions locally:
   ```bash
   docker compose up -d
   # legacy → http://localhost:8080
   # vue    → http://localhost:5173
   ```
   Run only one:
   ```bash
   docker compose up -d chat-view-legacy
   docker compose up -d chat-view-vue
   ```

The `docker-compose.yml` is **for local development only**. Legacy runs under `nginx:alpine`; the Vue service is `node:22-alpine` running `npm run dev` against a named volume for `node_modules`.

## Documentation

- **CLAUDE.md** — full technical reference (schema, conventions, architecture)
- **FEATURES.md** — implemented features and todo list
- **SETUP.md** — Google OAuth setup guide
- **docs/architecture/review-2026-05.md** — the rewrite plan: Phase 1 (legacy bug-fixes / features), Phase 2 (Vue rewrite milestones M1–M3)
