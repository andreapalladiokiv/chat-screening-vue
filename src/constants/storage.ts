/**
 * Canonical localStorage keys used across the app.
 *
 * Centralised so renames / namespacing decisions land in one diff. The
 * `sb_*` prefix is inherited from the legacy app — keeping it lets the
 * Vue side reuse existing per-user state (selected env, reviewed
 * sessions) without forcing a one-time re-pick after cutover.
 */
export const StorageKeys = {
  /** Active environment index in the multi-env switcher (string-typed int). */
  selectedEnv: 'sb_selected_env',

  /** Last-known Supabase project subdomain — written after a successful
   *  OAuth round-trip so reviewedKey() can scope its set per-environment. */
  projectId: 'sb_project_id',

  /** Last-known Supabase anon key — same lifecycle as projectId. */
  anonKey: 'sb_key',

  /** Active timezone (IANA, e.g. "Europe/Chisinau"). Default is the
   *  browser's resolvedOptions().timeZone. */
  timezone: 'chat_view_timezone',
} as const;

/** Per-project key for the reviewed-session id set. Returns a string
 *  scoped to whichever Supabase project the user is currently on, so
 *  the Dev and Prod review lists don't collide. */
export function reviewedSessionsKey(projectId?: string | null): string {
  const id = projectId ?? localStorage.getItem(StorageKeys.projectId) ?? 'default';
  return `sb_reviewed_${id}`;
}
