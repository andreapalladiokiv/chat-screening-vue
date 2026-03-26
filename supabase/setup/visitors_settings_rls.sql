-- ============================================================================
-- RLS policy for visitors_settings table (prerequisite for Chat View)
-- ============================================================================
-- Enables RLS and grants SELECT access to authenticated users.
-- This is in setup/ (not migrations/) because visitors_settings is a
-- pre-existing table not managed by this repo.
-- ============================================================================

ALTER TABLE visitors_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read visitors_settings"
  ON visitors_settings
  FOR SELECT
  TO authenticated
  USING (true);
