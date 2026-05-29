import type { Session } from '@/types/session';

/**
 * True if the session carries any enrichment from visitors_settings —
 * any of project / visitorType / language / isWhatsapp / validation /
 * lead/case/booking flags / conversationId.
 *
 * Used to choose between rendering badges and the "no visitor data"
 * placeholder, consistently in SessionListItem and DetailSidebar.
 */
export function hasEnrichment(session: Session | null | undefined): boolean {
  if (!session) return false;
  return !!(
    session.project ||
    session.visitorType ||
    session.language ||
    session.isWhatsapp ||
    session.validation ||
    session.hasLead ||
    session.hasCase ||
    session.hasBooking ||
    session.conversationId
  );
}
