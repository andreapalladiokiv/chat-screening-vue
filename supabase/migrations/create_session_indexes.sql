-- ============================================================================
-- Migration Step 2 of 2: Performance indexes (run AFTER step 1)
-- ============================================================================
-- Run each statement ONE AT A TIME in the Supabase SQL Editor.
-- CONCURRENTLY builds indexes without blocking reads or writes.
-- Safe to re-run (IF NOT EXISTS).
-- ============================================================================

-- Index 1: Run this alone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_created_at
  ON chat_messages (created_at DESC);

-- Index 2: Run this alone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_id
  ON chat_messages (session_id);

-- Index 3: Run this alone
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_session_created
  ON chat_messages (session_id, created_at DESC);
