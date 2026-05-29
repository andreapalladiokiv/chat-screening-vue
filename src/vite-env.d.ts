/// <reference types="vite/client" />

interface ImportMetaEnv {
  // Comma-separated env names in display order, e.g. "Development,Production,Stage"
  readonly VITE_ENV_NAMES?: string;
  // Per-env Supabase project subdomains, comma-separated, aligned to VITE_ENV_NAMES
  readonly VITE_ENV_PROJECT_IDS?: string;
  // Per-env Supabase anon keys, comma-separated, aligned to VITE_ENV_NAMES
  readonly VITE_ENV_ANON_KEYS?: string;
  // Per-env allowed email domains, comma-separated, '|'-separated within each env.
  // Empty entry = allow all. Example: "|kiv.dev|kiv.dev"
  readonly VITE_ENV_ALLOWED_DOMAINS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
