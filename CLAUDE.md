# CLAUDE.md — Chat View

This file provides context for AI assistants working in this repository.

## Project Overview

**Chat View** is a single-page web application for viewing AI chat conversations stored in a Supabase (PostgreSQL) database. It presents sessions in a WhatsApp-style interface, with per-session and per-message feedback capabilities.

The application is a zero-build-step frontend: open `index.html` in a browser and it works. There are no npm scripts, no bundlers, and no test runner.

## Repository Structure

```
chat-view/
├── index.html                              # Single-page app (HTML + all CSS)
├── app.js                                  # All application logic (~1700 lines)
├── config.js                               # Gitignored — Supabase credentials, multi-env config, filter options + optional domain restriction
├── favicon.svg                             # Eyes emoji favicon
├── CLAUDE.md                               # AI assistant context (this file)
├── FEATURES.md                             # Feature list and todo tracker
├── README.md                               # Project overview
├── SETUP.md                                # Google OAuth setup guide
└── supabase/
    ├── functions/
    │   ├── chat-feedback/
    │   │   └── index.ts                    # Deno Edge Function: store & forward feedback
    │   └── invite-user/
    │       └── index.ts                    # Deno Edge Function: admin invite + role upsert
    ├── migrations/
    │   ├── create_chat_feedback.sql        # DB schema for feedback table
    │   ├── add_submitted_by_to_chat_feedback.sql  # Adds submitted_by column
    │   ├── create_user_roles.sql           # DB schema + RLS + trigger for user roles
    │   ├── first_user_admin_role.sql       # Override: first user gets admin role
    │   ├── create_session_rpc.sql          # RPCs: get_session_list, get_filter_options (two-stage architecture + visitors_settings JOIN)
    │   ├── create_session_indexes.sql      # Performance indexes (run separately, CONCURRENTLY)
    │   └── add_visitors_settings_index.sql # Index on visitors_settings.session_id
    └── setup/
        ├── chat_messages_rls.sql           # RLS policy for chat_messages (prerequisite)
        └── visitors_settings_rls.sql       # RLS policy for visitors_settings (prerequisite)
```

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla JavaScript (ES2020+), HTML5, CSS |
| Database | Supabase (PostgreSQL) |
| Backend | Supabase Edge Functions (Deno/TypeScript) |
| Auth | Supabase Auth with Google OAuth provider |
| Supabase client | `@supabase/supabase-js@2` via CDN (`jsdelivr`) |
| Build system | None |
| Test framework | None |
| CSS preprocessor | None |

## Running the Application

No build step is needed. Open `index.html` directly in a browser, or serve it with any static file server:

```bash
# Any of these work:
npx serve .
python3 -m http.server
# Or just open index.html in a browser
```

**Login screen** shows an optional environment dropdown (when multiple environments configured) and a "Sign in with Google" button. No credential fields are displayed.

**Credentials must be provided via `config.js`** (gitignored) — the login button will show an error if neither `config.js` nor saved `localStorage` values are present.

`config.js` supports two formats:

```js
// Single-environment format (original, backward compatible)
window.CHAT_VIEW_CONFIG = {
  projectId: 'your-project-id',   // subdomain of your Supabase project
  anonKey:   'your-anon-key',     // public anon key from Supabase Dashboard → Project Settings → API
  // allowedDomains: ['yourcompany.com'],  // optional: restrict to specific email domains
};
```

```js
// Multi-environment format — shows a named dropdown on the login screen
window.CHAT_VIEW_CONFIG = {
  environments: [
    { name: 'Staging',    projectId: 'staging-id',    anonKey: 'staging-key',    allowedDomains: [] },
    { name: 'Production', projectId: 'prod-id',       anonKey: 'prod-key',       allowedDomains: ['yourcompany.com'] },
  ]
};
```

When `environments` has 2+ entries, an **"Environment"** `<select>` dropdown appears on the login card above the Google sign-in button. With only 1 entry (or the single-env format), the dropdown is hidden.

Credentials and the selected environment index are persisted in `localStorage` (`sb_project_id`, `sb_key`, `sb_selected_env`) after the first successful OAuth redirect, so subsequent visits restore the correct environment without re-reading `config.js`.

**Persistent auth sessions**: On init, the app calls `getSession()` to restore stored sessions (Supabase v2 auto-exchanges OAuth hash tokens during this call). A `setupAuthListener()` callback monitors `SIGNED_OUT` events for automatic logout when tokens expire. This keeps users logged in across page reloads without re-prompting for Google sign-in.

## Database Schema

The app reads from a `chat_messages` table (not created in this repo — it must pre-exist) and writes feedback to a `chat_feedback` table.

### Expected `chat_messages` table columns

| Column | Type | Notes |
|---|---|---|
| `id` | any | Primary key |
| `session_id` | text | Groups messages into conversations |
| `created_at` | timestamptz | Used for ordering and date filters |
| `message` | jsonb / text | JSON object with message data (see Message Format below) |

### `chat_feedback` table (created by migration)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key (identity) |
| `feedback_type` | text | `'chat'` or `'message'` |
| `category` | text | bug / suggestion / praise / other |
| `comment` | text | Free-text feedback |
| `session_id` | text | Target session |
| `message_index` | int | Index of target message (message feedback only) |
| `message_type` | text | Type of target message |
| `message_timestamp` | timestamptz | Timestamp of target message |
| `message_text_excerpt` | text | Excerpt of target message |
| `tool_name` | text | Tool name (if message is a tool call) |
| `message_count` | int | Total messages in session at time of feedback |
| `raw_message` | jsonb | Full message object |
| `submitted_by` | text | Email of user who submitted feedback |
| `submitted_at` | timestamptz | When the feedback was submitted |
| `created_at` | timestamptz | Row creation time |

Run the migrations on your Supabase project:
```bash
supabase db push
# or apply manually via Supabase SQL Editor
```

### `chat_view_user_roles` table (created by migration)

| Column | Type | Notes |
|---|---|---|
| `id` | bigint | Primary key |
| `user_id` | uuid | FK to `auth.users(id)` on delete cascade |
| `role` | text | `'user'` or `'admin'` |
| `email` | text | User's email address |
| `created_at` | timestamptz | |
| `updated_at` | timestamptz | |

RLS is enabled; users may only read their own row (anon key access). A DB trigger (`on_auth_user_created`) auto-inserts a `'user'` row when a new `auth.users` record is created, covering both Google OAuth sign-ins and accepted invitations.

**First-user admin override**: Running `first_user_admin_role.sql` replaces the trigger so that the very first user to sign up gets the `'admin'` role. All subsequent users get `'user'` as normal.

### RPC Functions (created by `create_session_rpc.sql`)

| Function | Returns | Purpose |
|---|---|---|
| `safe_jsonb(val text)` | `jsonb` | Safe JSON cast — returns `NULL` on parse failure instead of raising an error |
| `get_session_list(...)` | `jsonb` | Two-stage session query: Stage 1 finds candidate session IDs via lightweight GROUP BY; Stage 2 extracts full JSONB metadata + visitors_settings enrichment. Accepts params: `p_limit`, `p_cursor`, `p_date_from`, `p_date_to`, `p_msg_min`, `p_msg_max`, `p_tools`, `p_categories`, `p_request_types`, `p_session_id`, `p_projects`, `p_visitor_types`, `p_languages`, `p_validation`, `p_is_whatsapp`, `p_has_lead`, `p_has_case`, `p_has_booking` |
| `get_filter_options()` | `jsonb` | Returns distinct tool names, categories, request types (from last 3 days of `chat_messages`), and projects, visitor types, languages (directly from `visitors_settings`, no date scoping). Uses separate queries for performance. |

### `visitors_settings` table (pre-existing, not created by this repo)

| Column | Type | Notes |
|---|---|---|
| `session_id` | text | JOIN key to `chat_messages.session_id` |
| `project` | text | Project name |
| `type` | text | Visitor type |
| `language` | text | Language |
| `validation` | boolean | Whether the visitor is validated |
| `is_whatsapp` | boolean | Whether the session is from WhatsApp |
| `lead_id` | numeric | Lead ID (presence used as filter) |
| `case_id` | numeric | Case ID (presence used as filter) |
| `booking_identifier` | text | Booking identifier (presence used as filter) |
| `request_id` | text | Request ID |
| `masked_client_phone` | text | Masked client phone number |

Enrichment data from `visitors_settings` is LEFT JOINed in `get_session_list` Stage 2. Visitor badges (project, type, language, WhatsApp, validated, lead/case/booking) are displayed in the chat header bar; AI conversation badges (categories, request types) are displayed in the session list items.

### Prerequisite setup (`supabase/setup/`)

- `chat_messages_rls.sql` — enables RLS on `chat_messages` and creates a `SELECT` policy for authenticated users. Without this, authenticated users will see 0 sessions. This is in `setup/` (not `migrations/`) because it targets a pre-existing table not managed by this repo.
- `visitors_settings_rls.sql` — enables RLS on `visitors_settings`, grants `SELECT` to `authenticated`, and creates a `SELECT` policy. Both the GRANT and the RLS policy are required for the session enrichment JOIN to work.

## Message Format

Messages in `chat_messages.message` must be a JSON object with a `type` field:

```json
// Human (customer) message
{ "type": "human", "content": "Hello, I need help..." }

// AI agent message (final response, no tool calls) — wrapped format
{
  "type": "ai",
  "content": "{\"output\": {\"text\": \"...\", \"request_category\": \"...\", \"request_type\": \"...\", \"identity_verified\": true, \"end_conversation\": false}}"
}

// AI agent message (final response, no tool calls) — flat format
{
  "type": "ai",
  "content": "{\"text\": \"...\", \"request_category\": \"...\", \"request_type\": \"...\", \"identity_verified\": false, \"end_conversation\": false}"
}

// AI message with tool calls
{
  "type": "ai",
  "content": "...",
  "tool_calls": [{ "name": "tool_name", "args": { ... } }]
}

// Tool result
{ "type": "tool", "name": "tool_name", "tool_call_id": "...", "content": "..." }

// System message
{ "type": "system", "content": "..." }
```

AI messages without `tool_calls` (or with an empty array) are treated as final responses. Their `content` is parsed as JSON and the following fields are extracted (supported both nested under `output` and at the top level):
- `text` — the response text displayed to the user
- `request_category` — shown as a badge
- `request_type` — shown as a badge
- `identity_verified` — shown as a green "verified" badge
- `end_conversation` — shown as a red "end" badge

The code checks `content.output` first (wrapped format), then falls back to `content` itself if it has a `text` property (flat format).

## Edge Functions

### `chat-feedback`

The `chat-feedback` Edge Function is deployed separately from the frontend. It is invoked by the frontend as `chat-feedback` (the deployed Supabase slug matches the folder name).

#### Deploy

```bash
supabase functions deploy chat-feedback
```

#### Required Secrets (set in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Provided automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided automatically by Supabase |
| `VA_FEEDBACK_FORM_WEBHOOK` | Optional | n8n webhook URL for forwarding feedback |

The Edge Function:
1. Inserts feedback into `chat_feedback` using the service role key (bypasses RLS)
2. Optionally forwards the full payload to an n8n webhook

### `invite-user`

Admin-only function that sends a Supabase invitation email and upserts a role row in `chat_view_user_roles`.

#### Deploy

```bash
supabase functions deploy invite-user
```

#### Required Secrets (set in Supabase Dashboard → Edge Functions → Secrets)

| Secret | Required | Description |
|---|---|---|
| `SUPABASE_URL` | Auto | Provided automatically by Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | Auto | Provided automatically by Supabase |
| `SUPABASE_ANON_KEY` | **Manual** | Required to verify caller's JWT — copy from Dashboard → Project Settings → API |

The Edge Function:
1. Verifies the caller's JWT and confirms they have `admin` role in `chat_view_user_roles`
2. Calls `auth.admin.inviteUserByEmail(email)` to send an invitation email
3. If the user already exists in Auth, looks them up via the Admin REST API and updates their role
4. Upserts the assigned role row in `chat_view_user_roles`

## Key Code Conventions

### JavaScript (app.js)

- **No framework** — plain DOM manipulation with `document.createElement`, `innerHTML`, `addEventListener`
- **Module pattern** — IIFE `init()` runs on load; no ES modules
- **Global state** — `db`, `allSessions`, `allToolNames`, `allCategories`, `allRequestTypes`, `currentSessionId`, `feedbackMeta`, `reviewedSessions`, `environments`, `currentUserRole`, `sessionCursor`, `isLoadingMore`, `noMoreSessions`, `filtersApplied`, `currentFilterParams`, `searchResults`, `searchDebounceTimer` are top-level variables
- **XSS prevention** — all user-supplied or database-sourced text is passed through `escapeHtml()` before setting `innerHTML`. Never set `innerHTML` with raw data.
- **Lazy loading** — Session list uses RPC `get_session_list` (two-stage architecture: fast GROUP BY for candidate IDs, then JSONB metadata extraction for those sessions only). Default load: 50 most recent sessions. Infinite scroll loads 10 more per batch. Filters are applied server-side via "Apply Filters" button with a max 3-day date range. Filter options (tools, categories, request types) are fetched once at login via `get_filter_options` RPC (AI metadata scoped to last 3 days; visitor options queried directly from `visitors_settings` without date scoping). Retries once on timeout with 3s delay.
- **Server-side search** — Session ID search queries the entire `chat_messages` table via `p_session_id` ILIKE parameter on `get_session_list`. Debounced at 400ms with a "Searching..." indicator
- **Shareable URLs / deep links** — selecting a session updates the URL with `?session=<id>&env=<index>` via `history.replaceState`; on page load or refresh, `autoSelectSessionFromURL()` checks the URL parameter and auto-selects the session. If the session isn't in the loaded list, it is fetched specifically via `get_session_list` with `p_session_id` and prepended. The `?env=` parameter restores the correct environment from the URL on init (before auth). Both query params are preserved through OAuth redirects so deep links work even when the user isn't logged in yet.
- **Keyboard shortcuts** — `J`/`K` navigate sessions, `E` expand/collapse tools, `R` toggle reviewed, `F` open feedback, `/` focus search, `Escape` close modals, `Ctrl+Shift+F` focus in-session search; session items are tabbable (`tabIndex=0`)
- **Copy** — hover over a session ID in the session list or any message bubble to reveal a copy button; click copies to clipboard with visual feedback
- **Empty states** — session list shows "No sessions found" or "No sessions match your filters" with a Clear Filters link
- **Timezone** — configurable via `getTimeZone()`/`setTimeZone()` functions; defaults to browser timezone; persisted in `localStorage` key `chat_view_timezone`; visible indicator + click-to-change button in top nav bar
- **Detail sidebar (right panel)** — shown when a session is selected; contains session controls (reviewed, feedback, expand/collapse), in-session search, quick-jump buttons, duration, message type pills, classification badges, tools used, and visitor info badges
- **In-session search** — search bar in the detail sidebar; debounced regex text matching with `<mark>` highlights, prev/next navigation, match counter
- **Enhanced system messages** — parsed JSON rendered as structured grid cards (label-value rows) instead of single-line text
- **Tool/system message dimensions** — tool and system bubbles have fixed 80% width; max-height 500px with scroll
- **Error handling** — connection test uses `select('id').limit(1)` (not `count('exact')`) to avoid full table scans; retries up to 3 times (2s between attempts) before showing an error; Supabase error objects are normalized to proper `Error` instances with meaningful messages (prevents `[object Object]` display); errors shown in `#login-error`; message errors logged to console
- **Status log** — `logStatus()` is a no-op that writes to `console.log` only; the visible status log was removed from the login UI
- **Environment switcher** — dropdown in the top nav bar (near Live badge) allows switching environments without logging out; triggers sign-out, re-auth with the new project's OAuth
- **Time gate** — shows the time range (last-activity based) of currently loaded sessions in the session info bar
- **Badge separation** — visitor settings badges (project, visitor type, language, WhatsApp, validated, lead/case/booking) shown in the detail sidebar; project and visitor type also shown in session list items; AI conversation badges (categories, request types, verified, end) shown only in session list items. Chat header shows only the session/conversation ID.

### CSS (index.html)

- All styles are in a single `<style>` block in `index.html`
- CSS custom properties (variables) defined in `:root` control: color palette (including per-badge variables like `--badge-verified-bg`, `--badge-end-text`, `--pill-human-bg`, `--tool-text`, `--env-bg`, `--danger-light`), shadows (`--shadow-sm` through `--shadow-xl`), radii (`--radius-sm` through `--radius-full`), and z-index layers (`--z-sidebar`, `--z-dropdown`, `--z-overlay`, `--z-modal`). All badge, pill, and label colors use CSS variables — avoid introducing hardcoded hex values.
- WhatsApp-inspired design: white left bubbles for customers, green right bubbles for AI, yellow center bubbles for tool calls
- Responsive breakpoint at `768px` (mobile: sidebar overlays)
- Accessibility: `prefers-reduced-motion` disables animations; `focus-visible` outlines on all interactive elements; ARIA attributes on modals (`role="dialog"`, `aria-modal`, `aria-labelledby`); `aria-live="polite"` on session count

### HTML Structure

- Two top-level panels: `#login-panel` (flex, visible by default) and `#chat-panel` (hidden until connected, shown via `.active` class)
- Inside `#chat-panel` (vertical flex layout):
  - `.top-nav` — horizontal nav bar containing: **burger menu** (☰) with dropdown, **search input**, **filter button** (opens popover), **env switcher**, **Live badge**, **Refresh button**
    - The burger menu dropdown shows: signed-in user email + role badge, **Users** and **Invite** items (Invite visible to admins only), and **Logout**
    - The **filter button** opens a fixed-position popover with all filters organized into labeled groups (Session, AI Response, Visitor, CRM); Apply closes the popover
  - `.filter-tags-bar` — horizontal strip of active filter condition tags (shown only when filters are active); each tag is dismissable (x) and triggers re-apply; "Clear all" link removes everything
  - `.content-area` — horizontal flex containing:
    - `#sidebar` — session info bar (count + time gate) and scrollable session list
    - `.chat-area` — wraps the header bar and `#chat-main`:
      - `#chat-header-bar` — permanent header with `#chat-session-controls` (shows session/conversation ID when selected)
      - `#chat-main` — scrollable message area; wiped and repopulated on session switch
    - `#detail-sidebar` — right panel (320px), shown when a session is selected; contains session controls (reviewed/feedback/expand-collapse), in-session search, quick-jump buttons, duration, message pills, classification, tools, and visitor info
- `app.js` is loaded with a cache-busting query param (`?v=54`) — increment this when deploying changes
- Login panel contains only the environment selector (if multi-env), "Sign in with Google" button, and `#login-error`; no credential input fields, no status log

## Filtering Logic

Filtering is split between server-side (RPC) and client-side:

**Server-side (via `get_session_list` RPC, triggered by "Apply Filters" button):**
- **Date range** — max 3-day gap enforced by the UI; auto-fills last 3 days if not specified
- **Message count** — inclusive min/max
- **Tools** — session must contain **all** selected tools (AND logic)
- **Categories** — session must match **at least one** selected category (OR logic)
- **Request types** — session must match **at least one** selected request type (OR logic)
- **Project** — session must match **at least one** selected project (OR logic, via `visitors_settings`)
- **Visitor type** — session must match **at least one** selected type (OR logic, via `visitors_settings`)
- **Language** — session must match **at least one** selected language (OR logic, via `visitors_settings`)
- **Validated** — exact boolean match (via `visitors_settings`)
- **WhatsApp** — exact boolean match (via `visitors_settings`)
- **Has lead / Has case / Has booking** — boolean presence filters (via `visitors_settings`)

**Server-side search (debounced, via search input):**
- **Session ID / Conversation ID search** — ILIKE substring match on `session_id` or `visitors_settings.conversation_id` across the entire database; 400ms debounce; returns up to 50 results

**Client-side (instant, in `renderSessionList()`):**
- **Sort** — newest / oldest / most messages / fewest messages (sorts loaded sessions only)
- **Reviewed** — `all` / `reviewed` / `unreviewed`

## Mark as Reviewed

Reviewed state is managed client-side (no database writes):
- `reviewedSessions` — a `Set<string>` of reviewed session IDs, kept in memory
- Stored in `localStorage` as a JSON array under key `sb_reviewed_<projectId>` (separate per project)
- Loaded in `loadReviewed()` called during `init()` and `handleRefresh()`
- Toggled via `toggleReviewed(sessionId)` from the "Mark Reviewed" button in the chat header
- Sessions in the set show a `reviewed` badge in the session list and a highlighted "Reviewed ✓" button

## Common Gotchas

1. **Edge function slug**: The file is `supabase/functions/chat-feedback/` and the frontend calls `db.functions.invoke('chat-feedback', ...)`. The deployed Supabase slug must match — if you redeploy under a different name, update the `invoke` call in `submitFeedback()` (`app.js`) accordingly.

2. **Cache-busting**: `app.js` is loaded as `app.js?v=53`. Increment the version number when deploying updated `app.js` to avoid browsers serving stale cached versions. Forgetting this has caused runtime errors when HTML and JS are out of sync (e.g. removing a DOM element that old JS still references).

3. **config.js is required**: The login UI has no manual credential input fields. If `config.js` is absent and no credentials are saved in `localStorage`, the Google sign-in button will display an error. Always deploy `config.js` alongside `index.html`. Use the multi-env `environments` array format to expose a named dropdown for multiple Supabase projects.

4. **Empty tool_calls array**: AI messages with `tool_calls: []` (empty array) are treated the same as AI messages with no `tool_calls` field at all — they are rendered as final AI responses, not as tool call bubbles.

5. **RLS policies**: The app uses the anon key. If Supabase Row Level Security restricts `chat_messages`, the app will connect successfully but show 0 sessions. The `chat_feedback` table bypasses RLS via the Edge Function's service role key.

6. **Content parsing**: `message.content` in `chat_messages` may be either a string (requiring `JSON.parse`) or already a parsed object. The code handles both cases in `parseMessage()`.

7. **chat-header-bar lives outside chat-main**: `#chat-header-bar` is a sibling of `#chat-main`, not a child. This means it survives `chatMain.innerHTML = ''` calls during session switches and logout. Do not move it inside `#chat-main`.

8. **`chat_view_user_roles` must exist before first login**: `fetchOrCreateUserRole()` is called on every auth success. If the table is missing, all users are immediately signed out with an "Access denied" error. Run the `create_user_roles.sql` migration before deploying.

9. **GRANT SELECT required alongside RLS**: Supabase requires both a table-level `GRANT SELECT ... TO authenticated` and an RLS policy for queries to work. Missing the GRANT causes 500 errors even when the RLS policy exists. This applies to `chat_view_user_roles`, `visitors_settings`, and `chat_messages`.

10. **Recursive RLS policies cause 500 errors**: An RLS policy on `chat_view_user_roles` that itself queries `chat_view_user_roles` (e.g., "Admins manage roles") causes PostgreSQL error `42P17: infinite recursion detected`. Only the simple `auth.uid() = user_id` SELECT policy should exist.

11. **`visitors_settings` index required for large datasets**: Without `idx_visitors_settings_session_id`, the `get_filter_options` RPC times out (error `57014`) on environments with large `visitors_settings` tables. Run `add_visitors_settings_index.sql` on every environment.

12. **`safe_jsonb` function must be deployed before RPCs**: Both `get_session_list` and `get_filter_options` depend on the `safe_jsonb(text)` helper function. If it is missing, both RPCs return 500 errors and the app shows no filter options and broken infinite scroll. Run `create_session_rpc.sql` (which defines `safe_jsonb`) on every environment before using the app.

13. **Supabase Realtime requires publication + RLS**: For live sidebar updates, `chat_messages` must be added to the `supabase_realtime` publication **and** have a SELECT RLS policy for `authenticated` users. The publication can be checked with `SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime'`. Without both, the WebSocket connects (Live badge turns green) but no events are delivered.

14. **Filter options loaded via RPC at login**: Filter dropdown values (tools, categories, request types, projects, visitor types, languages) are fetched once via `get_filter_options` RPC at login and on refresh. Optionally, `config.js` can define a `filterOptions` object per environment to skip the RPC call — if present and non-empty, the RPC is not called.

## Development Workflow

Since there is no build step:

1. Edit `index.html` (for HTML structure or CSS changes) or `app.js` (for logic changes)
2. Reload the browser
3. Increment the `?v=N` cache-busting param in `index.html` when deploying
4. **Update documentation** (see rule below)

For Edge Function changes:
1. Edit `supabase/functions/chat-feedback/index.ts`
2. Deploy: `supabase functions deploy chat-feedback`

For `invite-user` Edge Function changes:
1. Edit `supabase/functions/invite-user/index.ts`
2. Deploy: `supabase functions deploy invite-user`

### Documentation update rule (MANDATORY)

After every implementation — whether it is a new feature, bug fix, refactor, schema change, or new file — you **must** update the relevant documentation before considering the work done:

- **CLAUDE.md** — update repository structure, database schema, code conventions, or any section that the change affects
- **FEATURES.md** — add or modify the feature checklist entry; move todo items to implemented when done
- **README.md** — update if the change affects the quick start steps or project description

This is not optional. Outdated docs cause wasted time in every future session. Treat doc updates as part of the implementation, not a follow-up task.

## Git

- Default branch: `main`
- No CI/CD pipelines
- Remote: Gitea instance via local proxy (forwards to GitHub)
- **Branch creation policy**: Before creating a new branch, always ask the user for confirmation unless explicitly instructed to do so upfront.
