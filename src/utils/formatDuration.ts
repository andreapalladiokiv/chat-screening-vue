/**
 * Format a duration in milliseconds as a compact human string:
 *   < 1 minute  → "Ns"
 *   < 1 hour    → "Nm Ns"
 *   otherwise   → "Nh Nm"
 *
 * Mirrors legacy formatDuration char-for-char.
 */
export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}
