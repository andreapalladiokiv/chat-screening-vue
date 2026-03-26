-- ============================================================================
-- Index on visitors_settings.session_id for JOIN performance
-- ============================================================================
-- Run separately from other migrations (uses CONCURRENTLY to avoid locks).
-- Safe to run multiple times (IF NOT EXISTS).
-- ============================================================================

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_visitors_settings_session_id
  ON visitors_settings (session_id);
