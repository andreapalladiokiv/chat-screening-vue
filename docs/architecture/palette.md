# Chat-screening palette

Authoritative list of CSS custom properties used across the rewrite. Source of truth lives in [`src/styles/tokens.css`](../../src/styles/tokens.css). The legacy stylesheet ([`src/styles/legacy.css`](../../src/styles/legacy.css)) carries the same `:root` block verbatim during the cutover; once it's removed, tokens.css remains.

Tokens are grouped by **purpose**, not alphabetically — pick the right group when adding a new token.

---

## Base palette

| Token              | Hex       | Usage                                             |
| ------------------ | --------- | ------------------------------------------------- |
| `--bg`             | `#f0f2f5` | Main page background (light grey)                 |
| `--surface`        | `#fafbfc` | Surfaces — slightly lighter than `--bg`           |
| `--sidebar-bg`     | `#ffffff` | Sidebar (white)                                   |
| `--white`          | `#ffffff` | Pure white — modals, bubbles                      |
| `--border`         | `#e9edef` | Borders, dividers                                 |
| `--text-primary`   | `#111b21` | Primary text (near-black)                         |
| `--text-secondary` | `#556064` | Secondary text, meta info                         |

## Accent

| Token            | Hex       | Usage                                                 |
| ---------------- | --------- | ----------------------------------------------------- |
| `--accent`       | `#00a884` | Primary accent (WhatsApp teal) — buttons, focus, badges |
| `--accent-hover` | `#008f72` | Hover on the accent                                   |
| `--accent-dark`  | `#075e54` | Dark accent — login gradient, links                   |
| `--danger`       | `#dc3545` | Errors, destructive actions                           |
| `--danger-light` | `#fde8e8` | Light error backgrounds                               |

## Messages

| Token            | Hex       | Usage                                              |
| ---------------- | --------- | -------------------------------------------------- |
| `--chat-bg`      | `#e5ddd5` | Chat area background (WhatsApp light tan)          |
| `--human-bubble` | `#ffffff` | Human message bubble (white)                       |
| `--ai-bubble`    | `#dcf8c6` | AI message bubble (pale green, WhatsApp reply)    |
| `--tool-bg`      | `#fff3cd` | Tool message background (yellow-cream)             |
| `--tool-text`    | `#856404` | Tool message text (dark yellow)                    |
| `--system-color` | `#607080` | System message colour                              |

## Badges — categories / AI metadata

| Token                    | Hex       | Usage                                                  |
| ------------------------ | --------- | ------------------------------------------------------ |
| `--badge-bg`             | `#e1f0da` | Default badge (categories, request_types)              |
| `--badge-text`           | `#3b7a28` | Default badge text                                     |
| `--badge-verified-bg`    | `#def7ec` | "verified" badge                                       |
| `--badge-verified-text`  | `#03543f` |                                                        |
| `--badge-end-bg`         | `#fde8e8` | "end conversation" badge                               |
| `--badge-end-text`       | `#c53030` |                                                        |
| `--badge-reviewed-bg`    | `#e0f2fe` | "reviewed" badge                                       |
| `--badge-reviewed-text`  | `#0369a1` |                                                        |

## Badges — visitor settings

| Token                   | Hex       | Usage                                          |
| ----------------------- | --------- | ---------------------------------------------- |
| `--badge-project-bg`    | `#e0e7ff` | Project badge (indigo)                         |
| `--badge-project-text`  | `#3730a3` |                                                |
| `--badge-visitor-bg`    | `#fce7f3` | Visitor type (pink)                            |
| `--badge-visitor-text`  | `#9d174d` |                                                |
| `--badge-language-bg`   | `#ecfccb` | Language (lime)                                |
| `--badge-language-text` | `#3f6212` |                                                |
| `--badge-entity-bg`     | `#f3e8ff` | Lead/Case/Booking (purple)                     |
| `--badge-entity-text`   | `#6b21a8` |                                                |
| `--badge-whatsapp-bg`   | `#d1fae5` | WhatsApp                                       |
| `--badge-whatsapp-text` | `#065f46` |                                                |

## Pills — message type counts

| Token              | Hex       | Usage                              |
| ------------------ | --------- | ---------------------------------- |
| `--pill-human-bg`  | `#eef1f4` | Human pill (grey)                  |
| `--pill-human-text`| `#3d5166` |                                    |

(AI pill reuses `--badge-bg` / `--badge-text`; tool pill reuses `--tool-bg` / `--tool-text`; system pill reuses `--bg` / `--text-secondary`.)

## Env switcher

| Token          | Hex       | Usage                                |
| -------------- | --------- | ------------------------------------ |
| `--env-bg`     | `#e8eaf6` | Env selector background              |
| `--env-text`   | `#3949ab` | Env selector text                    |
| `--env-border` | `#c5cae9` | Env selector border                  |

## Admin

| Token                | Hex       | Usage                              |
| -------------------- | --------- | ---------------------------------- |
| `--admin-badge-bg`   | `#fef3c7` | Admin role badge                   |
| `--admin-badge-text` | `#92400e` |                                    |

---

## Non-colour tokens

### Radii

| Token            | Value | Usage                          |
| ---------------- | ----- | ------------------------------ |
| `--radius-sm`    | `4px` | Small radius (inputs, buttons) |
| `--radius`       | `8px` | Default radius                 |
| `--radius-lg`    | `12px`| Large radius (cards, modals)   |
| `--radius-full`  | `20px`| Pill / capsule shapes          |

### Shadows

| Token         | Value                                  | Usage                       |
| ------------- | -------------------------------------- | --------------------------- |
| `--shadow-sm` | `0 1px 3px rgba(0, 0, 0, 0.08)`        | Cards, top nav              |
| `--shadow`    | `0 1px 3px rgba(0, 0, 0, 0.08)`        | Default — alias of `--sm`   |
| `--shadow-md` | `0 2px 8px rgba(0, 0, 0, 0.1)`         | Dropdowns, popovers         |
| `--shadow-lg` | `0 4px 16px rgba(0, 0, 0, 0.12)`       | Modals                      |
| `--shadow-xl` | `0 8px 32px rgba(0, 0, 0, 0.15)`       | Login card, large modals    |

### Z-index layers

| Token           | Value | Usage                          |
| --------------- | ----- | ------------------------------ |
| `--z-sidebar`   | `10`  | Sidebar above content          |
| `--z-dropdown`  | `100` | Burger / env / filter dropdowns|
| `--z-overlay`   | `200` | Loading overlay backdrop       |
| `--z-modal`     | `500` | Feedback / admin / users modals|
