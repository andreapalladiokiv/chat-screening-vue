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
4. Open `index.html` in a browser

## Documentation

- **CLAUDE.md** — full technical reference (schema, conventions, architecture)
- **FEATURES.md** — implemented features and todo list
- **SETUP.md** — Google OAuth setup guide
