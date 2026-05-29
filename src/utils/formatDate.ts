/**
 * Date formatting helpers — mirror legacy app.js so the rendered text is
 * pixel-equivalent across the rewrite cutover.
 *
 *   formatDate(iso)   → "Nov 5, 2024" (locale en-US)
 *   formatTimeGate(...)→ "Nov 5, 14:30 — Nov 6, 09:12"
 *   formatTime(iso)   → "Nov 5, 14:30:45"
 *
 * All helpers read the active timezone from src/state/timezone.ts so a
 * tz change reactively re-renders anything that calls them inside a computed.
 */

import { currentTimezone } from '@/state/timezone';

function tz(): string | undefined {
  return currentTimezone.value || undefined;
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

/**
 * Message-bubble timestamp — "May 27, 15:11:01 PM" (matches legacy formatTime).
 * We deliberately omit `hour12` so the browser's en-US default kicks in,
 * exactly like legacy does.
 */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZone: tz(),
  });
}
