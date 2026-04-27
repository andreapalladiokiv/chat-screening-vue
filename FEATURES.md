# FEATURES.md — Chat View

Tracks implemented features and the todo list for future work.
Update this file whenever a feature is added, changed, or completed.

---

## Implemented Features

### Authentication & Connection
- [x] Google OAuth sign-in via Supabase Auth (no manual credential input fields)
- [x] Credentials (`projectId`, `anonKey`) loaded from `config.js` (`window.CHAT_VIEW_CONFIG`) or `localStorage`
- [x] **Multi-environment support** — `config.js` accepts an `environments` array; login card shows a named dropdown when 2+ environments are configured, hidden for single-env setups
- [x] Per-environment `allowedDomains` — each environment can restrict sign-in to different email domains
- [x] Credentials and selected environment index persisted in `localStorage` (`sb_project_id`, `sb_key`, `sb_selected_env`) across page reloads and OAuth redirects
- [x] Environment dropdown selection restored on page reload and after OAuth redirect
- [x] **Persistent auth sessions** — `onAuthStateChange` with `INITIAL_SESSION` event restores sessions on init (handles OAuth hash token exchange reliably across Supabase v2 versions); `SIGNED_OUT` handler defers logout via `setTimeout` to avoid deadlocks; 5s safety timeout for init
- [x] Optional domain restriction via `config.js` `allowedDomains` array — sign-out forced if domain not allowed
- [x] **User/admin roles** — every signed-in user must have a row in `chat_view_user_roles`; access denied (immediate sign-out) if no row exists
- [x] **Auth bypass prevention** — `fetchOrCreateUserRole()` is called before the chat panel is shown; removed users can no longer access the app
- [x] **Connection test with retry** — uses `select('id').limit(1)` (not `count('exact')`) to avoid full table scans; up to 3 attempts (2s delay between retries), 10s timeout per attempt; Supabase error objects normalized to proper `Error` instances (prevents `[object Object]` display)
- [x] **Flat AI message content format** — supports both `content.output.text` (wrapped) and `content.text` (flat) AI message formats; code checks `output` first, falls back to top-level `text` property
- [x] Clear error messages for failed connections (timeout, bad credentials, RLS, domain restriction)
- [x] Logout button clears auth session, selected environment, and returns to login screen
- [x] Login card shows the Google sign-in button, an error area, and the optional environment selector (no credential fields, no status log)

### Navigation & Header
- [x] **Top navigation bar** — horizontal bar containing burger menu, search input, filter button, env switcher, Live badge, and Refresh button
- [x] Permanent chat header bar (`#chat-header-bar`) outside `#chat-main`, always visible after login; shows session/conversation ID when a session is selected
- [x] **Detail sidebar** (`#detail-sidebar`) — right panel shown when a session is selected, containing:
  - Mark Reviewed / Reviewed ✓ toggle button
  - Feedback button
  - Expand All / Collapse All toggle
  - In-session search
  - Quick-jump buttons (First AI, First Tool, Last)
  - Duration, message type pills, classification badges, tools used
  - Visitor settings badges (project, visitor type, language, WhatsApp, validated, lead/case/booking)
- [x] **Burger menu** (☰) in top nav with dropdown containing:
  - Signed-in user email and role badge (Admin / User)
  - Users item — opens admin settings modal
  - Invite item (visible to admins only) — opens admin settings modal
  - Logout — signs out and returns to login screen
- [x] Pulsing `• Live` badge shown in top nav bar

### Session List
- [x] **Lazy-loading architecture** — default load: 50 most recent sessions scoped to last 3 days via `get_session_list` RPC (two-stage: fast GROUP BY for IDs, then JSONB metadata extraction) with 15s timeout and retry (up to 2 attempts, 2s delay)
- [x] **Infinite scroll** — scrolling to the bottom of the session list loads 10 more sessions per batch
- [x] Sessions grouped by `session_id`, sorted by selected sort order
- [x] Each session shows: ID (with copy button on hover), total message count, latest date, type-count pills, AI conversation badges
- [x] Type-count pills: human / ai / tool / system message counts per session
- [x] AI conversation badges per session: request category, request type, `verified`, `end`, `reviewed` flags (visitor settings badges shown in chat header only)
- [x] Refresh button reloads sessions (respects active filters)
- [x] Realtime updates: new messages and sessions appear automatically via Supabase Realtime (INSERT events); auto-reconnects on `CHANNEL_ERROR` / `TIMED_OUT` with 5s retry; suppressed when server-side filters or search results are active to prevent out-of-range sessions from appearing
- [x] Pulsing `• Live` badge shown in sidebar header when Realtime channel is active (`SUBSCRIBED`)
- [x] Filters and sort order preserved across realtime updates and manual refreshes
- [x] **Time gate** — session info bar shows the time range (last-activity based) of currently loaded sessions
- [x] **Environment switcher** — dropdown in top nav allows switching environments without returning to login

### Mark as Reviewed
- [x] "Mark Reviewed" button in the chat header toggles reviewed state for the open session
- [x] Reviewed sessions show a `reviewed` badge in the session list
- [x] Reviewed state stored in `localStorage` (key `sb_reviewed_<projectId>`, persisted as JSON array)
- [x] Reviewed state loaded on init and on every refresh

### User Management (Admin)
- [x] Admin users see an **Invite** item in the burger menu dropdown (hidden for non-admins)
- [x] Users / Invite items open an admin settings modal showing the signed-in user's name and role
- [x] Admin can invite a new user by email and assign them a `user` or `admin` role
- [x] If the email already has a Supabase Auth account, only the role is updated (no duplicate invite sent)
- [x] Invite logic handled by `invite-user` Edge Function (admin-only, requires valid JWT + admin role check)

### Filtering & Search
- [x] **Server-side session ID / conversation ID search** — two-tier strategy: exact-match fast path via `.eq('session_id', q)` on `chat_messages` and `.eq('conversation_id', q)` on `visitors_settings` (index-backed, instant); falls back to RPC ILIKE substring search (with 10s timeout) only if no exact hit. Surfaces a visible "Search failed" message in the session list when the substring fallback errors or times out instead of silently rendering empty results. Debounced at 400ms.
- [x] **"Apply Filters" button** — server-side filters (date, tools, categories, request types, message count) applied on click via RPC
- [x] Datetime range filter (from/to) — `datetime-local` inputs for time-precise filtering; max 7-day gap enforced with warning (`FILTER_DATE_RANGE_MAX_DAYS`, matches the SQL safety-net fallback); auto-fills last 3 days if not specified
- [x] Message count filter (min/max), inclusive
- [x] Tools filter: multi-select dropdown+checklist, AND logic (session must use ALL selected tools)
- [x] Category filter: multi-select dropdown+checklist, OR logic (session matches any selected category)
- [x] Request type filter: multi-select dropdown+checklist, OR logic (session matches any selected type)
- [x] Reviewed filter: all / unreviewed only / reviewed only (client-side)
- [x] Sort: newest first, oldest first, most messages, fewest messages (client-side, on loaded sessions)
- [x] **Clear Filters** button resets all filter inputs and reloads default 50 sessions
- [x] Filter inputs persist after Apply (only cleared on Clear Filters)
- [x] Session count shown ("N sessions+" or "N sessions found" when filters active)
- [x] **Filter popover** — Notion-style filter button in top nav opens a fixed-position popover with all filters organized into labeled groups (Session, AI Response, Visitor, CRM); Apply closes the popover
- [x] **Active filter tags** — horizontal strip below top nav shows dismissable tags for each active filter condition; removing a tag re-applies filters; "Clear all" removes everything; filter button turns green when filters are active
- [x] Custom dropdown+checklist UI for tools, category, and request type:
  - Trigger button label updates to show count of selected items (e.g. "Tools (2)")
  - Clicking outside any open dropdown closes it; opening one closes the others
  - Checked state preserved when realtime updates rebuild dropdown options
- [x] Filter dropdown options populated from `get_filter_options` RPC (scoped to last 7 days)
- [x] **Authoritative client-side filter predicate** — after Apply, normalized filter criteria are stored in `currentFilterCriteria` and `renderSessionList` runs every session through `sessionMatchesFilter` (mirrors the RPC's AND/OR semantics). Guarantees the visible list always matches the active filters even if `allSessions` / `searchResults` contains non-matching items. Verified / end-conversation filters live in the same predicate as a single source of truth. Lenient on async-loading visitor settings (no false rejections during enrichment).
- [x] **Filter error visibility & rollback** — if the `get_session_list` RPC fails, `applyFilters` resets `filtersApplied` / `currentFilterParams` / `currentFilterCriteria` and surfaces the error message in the session count, so Realtime resumes and the user isn't left in a stale half-filtered state.

### Message View
- [x] Messages loaded on session click, ordered by `created_at` ascending
- [x] Loading spinner while messages fetch
- [x] Messages scroll to bottom on load
- [x] Human (customer) messages: white left-aligned bubbles
- [x] AI final response messages: green right-aligned bubbles with metadata badges (category, type, verified, end)
- [x] AI tool-call messages: yellow center bubbles with collapsible args (`<details>`)
- [x] Tool result messages: yellow center bubbles with collapsible response (`<details>`)
- [x] System messages: compact centered pill-style bubbles
- [x] All message bubbles show formatted timestamp (Europe/Chisinau timezone)
- [x] Realtime: new messages appended live when the currently viewed session receives an INSERT
- [x] XSS protection: all database content passed through `escapeHtml()` before rendering

### Feedback System
- [x] Per-session feedback: "Feedback" button in chat header session controls
- [x] Per-message feedback: hover button (💬) on every message bubble
- [x] Feedback modal with category select (bug / suggestion / praise / other) and free-text comment
- [x] Feedback submitted to Supabase Edge Function (`chat-feedback`) with full message metadata, signed-in user email, and active environment name (`env` field)
- [x] Edge Function stores feedback in `chat_feedback` table (service role key bypasses RLS)
- [x] Edge Function optionally forwards feedback to n8n webhook (`VA_FEEDBACK_FORM_WEBHOOK`)
- [x] Success/error status shown in modal after submission
- [x] Modal closes automatically 1.5s after successful submission
- [x] Click outside modal to cancel

### Visitor Settings Integration
- [x] **Session enrichment** — `get_session_list` LEFT JOINs `visitors_settings` (via `session_id`) to enrich sessions with project, visitor type, language, validation, WhatsApp channel, lead/case/booking presence, request ID, and masked phone
- [x] **Visitor badges in detail sidebar** — project (indigo), visitor type (pink), language (lime), WhatsApp (teal), validated (teal), lead/case/booking entity (purple) shown in detail sidebar when session is selected
- [x] **Badge separation** — full visitor settings badges shown in detail sidebar; project and visitor type also shown in session list items; AI conversation badges (categories, request types) shown only in session list items
- [x] **Visitor settings filters** — server-side filters for project, visitor type, language (multi-select dropdown checklists, OR logic), validation, WhatsApp (boolean select), has lead/case/booking (boolean select)
- [x] **Filter options from `get_filter_options` RPC** — tools, categories, request types, projects, visitor types, and languages fetched once at login; optionally overridden by `config.js` `filterOptions` per environment

### UI / UX
- [x] WhatsApp-inspired design with CSS custom properties for theming
- [x] CSS design tokens: shadow scale (`--shadow-sm` to `--shadow-xl`), radius scale (`--radius-sm` to `--radius-full`), z-index layers (`--z-sidebar` to `--z-modal`), comprehensive badge/pill/tool color variables
- [x] Responsive layout: sidebar overlays at ≤768px
- [x] Collapsible tool call / tool result details (`<details>` element)
- [x] **Expand/Collapse All** toggle button in chat header — expands or collapses all tool `<details>` elements at once
- [x] **Detail sidebar (right panel)** — shown when a session is selected; displays duration, message type pills, classification badges (category, type, verified, end), tools used, visitor info, and quick-jump buttons; replaces the former in-messages summary card
- [x] **Quick-jump buttons** in detail sidebar — "First AI", "First Tool", "Last" scroll to respective messages
- [x] **Standardized tool/system message dimensions** — fixed 80% width, max-height 500px with scroll for tool and system bubbles
- [x] **Enhanced system messages** — rendered as structured grid cards (label + value rows) instead of single-line text
- [x] **Copy message text** — hover over any message bubble to reveal a "Copy" button; click copies message text to clipboard
- [x] **In-session search** — search bar in chat header (always visible); debounced text matching with `<mark>` highlights, prev/next navigation, and match counter
- [x] **Keyboard shortcuts** — `J`/`K` navigate sessions, `E` expand/collapse tools, `R` toggle reviewed, `F` open feedback, `/` focus search, `Escape` close modals, `Ctrl+Shift+F` focus in-session search
- [x] **Configurable timezone** — defaults to browser timezone; click the timezone indicator in the top nav to change; persisted in `localStorage`
- [x] **Filter by verified / end-conversation** — boolean select filters in the AI Response filter group; applied client-side
- [x] Cache-busting query param on `app.js` (`?v=67`) — increment when deploying
- [x] Loading overlay (spinner with "Loading..." text) during session load and filter apply
- [x] "Searching..." indicator in session list during server-side search
- [x] **Empty states** — "No sessions found" or "No sessions match your filters" with Clear Filters action link
- [x] **Copy session ID** — hover over session ID in session list to reveal copy button; click copies to clipboard with visual feedback (✓)
- [x] **Shareable session deep links** — `?session=<id>&env=<index>` URL params; auto-selects session on page load and refresh via `autoSelectSessionFromURL()`; `?env=` restores environment from URL; fetches session directly via exact `chat_messages` query (index-backed, works for any session age) with `visitors_settings` enrichment and client-side metadata extraction via `buildSessionFromMessages()`; both params preserved through OAuth redirects; updated via `history.replaceState`
- [x] **Session ID overflow** — long session IDs truncated with ellipsis in sidebar
- [x] Global JS error handler shows errors in the browser console
- [x] CDN load error handler for Supabase library (error shown in `#login-error`)

### Accessibility (WCAG AA)
- [x] **Color contrast** — `--text-secondary` and `--system-color` darkened for AA compliance; `.type-pill.human` text darkened
- [x] **Focus-visible states** — all buttons, inputs, selects, and tabbable elements show `outline: 2px solid var(--accent)` on keyboard focus
- [x] **Reduced motion** — `prefers-reduced-motion` media query disables all animations and transitions
- [x] **ARIA attributes** — `role="dialog"`, `aria-modal="true"`, `aria-labelledby` on all modals; `aria-label` on burger menu, refresh button; `aria-live="polite"` on session count
- [x] **Keyboard navigation** — Escape closes all modals and dropdowns; arrow keys navigate session list; session items are tabbable (`tabIndex=0`)

### Performance
- [x] **Targeted realtime DOM updates** — incoming messages update only the affected session `<li>` in-place (meta text, type pills, badges) and move it to top, instead of clearing and rebuilding the entire session list
- [x] **Session Map** — O(1) session lookups via `Map` keyed by session ID, replacing O(n) `Array.find()` calls
- [x] **No dynamic filter rebuild** — filter dropdown options loaded from `config.js` at login; realtime messages never trigger dropdown DOM rebuilds
- [x] **Debounced client-side filters** — checkbox toggles, sort, and reviewed filter changes debounced at 150ms to batch rapid changes into a single render
- [x] **Targeted session selection highlight** — clicking a session toggles the `.active` CSS class on two `<li>` elements instead of rebuilding the full list
- [x] **DocumentFragment rendering** — session list built via `DocumentFragment` for single DOM append instead of N individual mutations
- [x] **Tabbable session items** — `tabIndex=0` + `data-session-id` on each `<li>` for keyboard navigation

---

## Todo

### Low Priority / Nice to Have
- [ ] **Export** — download a session's messages as JSON or plain text
- [ ] **Session notes** — let users add a private text note to a session, stored in localStorage alongside reviewed state
- [ ] **Dark mode** — CSS variables are dark-mode ready; add `prefers-color-scheme: dark` media query or toggle
- [ ] **Event delegation for message feedback buttons** — replace per-message listeners with single delegated listener on `#chat-main`
