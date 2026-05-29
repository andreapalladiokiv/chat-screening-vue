/**
 * Date formatting helpers — mirror legacy app.js so the rendered text is
 * pixel-equivalent across the rewrite cutover.
 *
 * formatDate(iso)  → "Nov 5, 2024" (locale en-US)
 * formatRange(a,b) → "Nov 5, 14:30 — Nov 6, 09:12"
 */

// TIME_ZONE is a placeholder; the M2 timezone selector will source it from a
// store. For now we let the browser default kick in.
function tz(): string | undefined {
  return undefined;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: tz(),
  });
}

export function formatDateTimeShort(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: tz(),
  });
}

/**
 * Format the session list row "meta" line. Uses U+00B7 (middle dot) as a
 * separator to match legacy character-for-character.
 *
 *   "12 messages · Nov 5, 2024"
 */
export function formatSessionMeta(count: number, latest: string): string {
  return `${count} messages · ${formatDate(latest)}`;
}

/**
 * Format a time-gate range across the loaded session set.
 *
 *   "Nov 4, 09:12 — Nov 5, 18:47"
 */
export function formatTimeGate(earliest: string, latest: string): string {
  return `${formatDateTimeShort(earliest)} — ${formatDateTimeShort(latest)}`;
}
