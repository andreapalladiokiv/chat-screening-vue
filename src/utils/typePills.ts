import type { TypeCounts } from '@/types/session';

export interface TypePill {
  kind: 'human' | 'ai' | 'tool' | 'system';
  n: number;
  /** Short label shown inside the pill ("human" / "ai" / "tool" / "sys"). */
  label: string;
}

/**
 * Build the displayed pill list from a session's typeCounts.
 * Skips zero buckets — matches legacy behaviour where empty pills are
 * never rendered. Same shape consumed by SessionListItem and DetailSidebar.
 */
export function buildTypePills(tc: TypeCounts): TypePill[] {
  const out: TypePill[] = [];
  if (tc.human) out.push({ kind: 'human', n: tc.human, label: 'human' });
  if (tc.ai) out.push({ kind: 'ai', n: tc.ai, label: 'ai' });
  if (tc.tool) out.push({ kind: 'tool', n: tc.tool, label: 'tool' });
  if (tc.system) out.push({ kind: 'system', n: tc.system, label: 'sys' });
  return out;
}
