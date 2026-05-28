# Chat View

A single-page web application for reviewing AI chat conversations stored in Supabase. Presents sessions in a WhatsApp-style interface with per-session and per-message feedback, server-side filtering, and role-based access control.

## Stack

- **Frontend**: Vanilla JavaScript, HTML, CSS (zero build step)
- **Database**: Supabase (PostgreSQL) with RPC functions for server-side filtering
- **Backend**: Supabase Edge Functions (Deno/TypeScript)
- **Auth**: Google OAuth via Supabase Auth

## Quick Start

1. Create `config.js` with your Supabase credentials (see `CLAUDE.md` for format)
2. Run the SQL migrations in `supabase/migrations/`
3. Deploy Edge Functions: `supabase functions deploy chat-feedback` and `supabase functions deploy invite-user`
4. Run locally:
   ```bash
   docker compose up -d        # http://localhost:8080
   ```
   Or open `index.html` directly in a browser / serve with any static server.

The `docker-compose.yml` is intended **for local development only** — it runs `nginx:alpine` on port 8080 with bind-mounted sources and caching disabled, so edits reflect on reload.

## Documentation

- **CLAUDE.md** — full technical reference (schema, conventions, architecture)
- **FEATURES.md** — implemented features and todo list
- **SETUP.md** — Google OAuth setup guide
