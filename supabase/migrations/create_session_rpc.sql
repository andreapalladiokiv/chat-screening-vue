-- ============================================================================
-- Migration Step 1 of 2: Functions (run this in Supabase SQL Editor)
-- ============================================================================
-- Safe to run multiple times (CREATE OR REPLACE).
--
-- Two-stage architecture for performance on large tables:
--   Stage 1 — find candidate session IDs using lightweight GROUP BY (index-friendly)
--   Stage 2 — extract full metadata (JSONB parsing) only for those few sessions
-- ============================================================================

-- ── Helper: safe JSON cast ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION safe_jsonb(val text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  IF val IS NULL OR val = '' THEN RETURN NULL; END IF;
  RETURN val::jsonb;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

-- Drop old signature so CREATE OR REPLACE works with the new parameter list
DROP FUNCTION IF EXISTS get_session_list(int, text, text, text, int, int, text[], text[], text[]);

-- ── RPC: get_session_list ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_session_list(
  p_limit         int      DEFAULT 50,
  p_cursor        text     DEFAULT NULL,
  p_date_from     text     DEFAULT NULL,
  p_date_to       text     DEFAULT NULL,
  p_msg_min       int      DEFAULT NULL,
  p_msg_max       int      DEFAULT NULL,
  p_tools         text[]   DEFAULT NULL,
  p_categories    text[]   DEFAULT NULL,
  p_request_types text[]   DEFAULT NULL,
  p_session_id    text     DEFAULT NULL    -- substring search on session_id (searches ALL data)
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_cursor    timestamptz := CASE WHEN p_cursor    IS NOT NULL THEN p_cursor::timestamptz    ELSE NULL END;
  v_date_from timestamptz := CASE WHEN p_date_from IS NOT NULL THEN p_date_from::timestamptz ELSE NULL END;
  v_date_to   timestamptz := CASE WHEN p_date_to   IS NOT NULL THEN p_date_to::timestamptz   ELSE NULL END;
  v_has_meta_filters boolean := (p_tools IS NOT NULL OR p_categories IS NOT NULL OR p_request_types IS NOT NULL);
  v_session_ids text[];
  result jsonb;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STAGE 1: Find candidate session IDs
  -- ═══════════════════════════════════════════════════════════════════════════

  IF NOT v_has_meta_filters THEN
    -- FAST PATH: No metadata filters needed.
    -- Simple GROUP BY uses the session_id index — no JSONB parsing.
    SELECT array_agg(sub.session_id) INTO v_session_ids
    FROM (
      SELECT cm.session_id
      FROM   chat_messages cm
      WHERE  (v_date_from IS NULL OR cm.created_at >= v_date_from)
        AND  (v_date_to   IS NULL OR cm.created_at <= v_date_to)
        AND  (p_session_id IS NULL OR cm.session_id ILIKE '%' || p_session_id || '%')
      GROUP BY cm.session_id
      HAVING (v_cursor  IS NULL OR MAX(cm.created_at) < v_cursor)
        AND  (p_msg_min IS NULL OR COUNT(*) >= p_msg_min)
        AND  (p_msg_max IS NULL OR COUNT(*) <= p_msg_max)
      ORDER BY MAX(cm.created_at) DESC
      LIMIT  p_limit
    ) sub;

  ELSE
    -- FILTERED PATH: Metadata filters require JSONB parsing.
    -- Frontend enforces max 3-day date range. Default to 7 days as safety net.
    IF v_date_from IS NULL AND v_date_to IS NULL THEN
      v_date_from := NOW() - INTERVAL '7 days';
    END IF;

    WITH
    base AS (
      SELECT session_id, created_at, message
      FROM   chat_messages
      WHERE  (v_date_from IS NULL OR created_at >= v_date_from)
        AND  (v_date_to   IS NULL OR created_at <= v_date_to)
        AND  (p_session_id IS NULL OR session_id ILIKE '%' || p_session_id || '%')
    ),
    msg_tools AS (
      SELECT DISTINCT b.session_id, tc.val->>'name' AS tool_name
      FROM   base b,
             LATERAL jsonb_array_elements(
               CASE WHEN jsonb_typeof(b.message->'tool_calls') = 'array'
                     AND jsonb_array_length(b.message->'tool_calls') > 0
                    THEN b.message->'tool_calls' ELSE '[]'::jsonb END
             ) AS tc(val)
      WHERE  tc.val->>'name' IS NOT NULL
      UNION
      SELECT DISTINCT b.session_id, b.message->>'name'
      FROM   base b
      WHERE  b.message->>'type' = 'tool' AND b.message->>'name' IS NOT NULL
    ),
    ai_meta AS (
      SELECT b.session_id,
             parsed.ao->>'request_category' AS category,
             parsed.ao->>'request_type'     AS request_type
      FROM base b,
      LATERAL (
        SELECT CASE
          WHEN jsonb_typeof(b.message->'content') = 'object' THEN b.message->'content'->'output'
          WHEN jsonb_typeof(b.message->'content') = 'string' THEN safe_jsonb(b.message->>'content')->'output'
          ELSE NULL
        END AS ao
      ) parsed
      WHERE b.message->>'type' = 'ai'
        AND (b.message->'tool_calls' IS NULL
             OR jsonb_typeof(b.message->'tool_calls') != 'array'
             OR jsonb_array_length(b.message->'tool_calls') = 0)
        AND parsed.ao IS NOT NULL
    ),
    session_stats AS (
      SELECT session_id, COUNT(*) AS msg_count, MAX(created_at) AS latest
      FROM base GROUP BY session_id
    ),
    session_tools_agg AS (
      SELECT session_id, array_agg(DISTINCT tool_name) AS tools
      FROM msg_tools GROUP BY session_id
    ),
    session_ai_agg AS (
      SELECT session_id,
             array_agg(DISTINCT category) FILTER (WHERE category IS NOT NULL) AS categories,
             array_agg(DISTINCT request_type) FILTER (WHERE request_type IS NOT NULL) AS request_types
      FROM ai_meta GROUP BY session_id
    ),
    filtered AS (
      SELECT ss.session_id
      FROM session_stats ss
      LEFT JOIN session_tools_agg sta ON ss.session_id = sta.session_id
      LEFT JOIN session_ai_agg   saa ON ss.session_id = saa.session_id
      WHERE (v_cursor    IS NULL OR ss.latest < v_cursor)
        AND (p_msg_min   IS NULL OR ss.msg_count >= p_msg_min)
        AND (p_msg_max   IS NULL OR ss.msg_count <= p_msg_max)
        AND (p_tools     IS NULL OR COALESCE(sta.tools, ARRAY[]::text[]) @> p_tools)
        AND (p_categories    IS NULL OR COALESCE(saa.categories, ARRAY[]::text[]) && p_categories)
        AND (p_request_types IS NULL OR COALESCE(saa.request_types, ARRAY[]::text[]) && p_request_types)
      ORDER BY ss.latest DESC
      LIMIT p_limit
    )
    SELECT array_agg(session_id) INTO v_session_ids FROM filtered;

  END IF;

  -- No candidates found — return early
  IF v_session_ids IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STAGE 2: Extract full metadata for candidate sessions only.
  -- Scoped to a small number of sessions, so JSONB parsing is fast.
  -- ═══════════════════════════════════════════════════════════════════════════
  WITH
  scoped AS (
    SELECT session_id, created_at, message
    FROM   chat_messages
    WHERE  session_id = ANY(v_session_ids)
  ),
  msg_tools AS (
    SELECT DISTINCT s.session_id, tc.val->>'name' AS tool_name
    FROM   scoped s,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.message->'tool_calls') = 'array'
                   AND jsonb_array_length(s.message->'tool_calls') > 0
                  THEN s.message->'tool_calls' ELSE '[]'::jsonb END
           ) AS tc(val)
    WHERE  tc.val->>'name' IS NOT NULL
    UNION
    SELECT DISTINCT s.session_id, s.message->>'name'
    FROM   scoped s
    WHERE  s.message->>'type' = 'tool' AND s.message->>'name' IS NOT NULL
  ),
  ai_meta AS (
    SELECT s.session_id,
           parsed.ao->>'request_category'                                AS category,
           parsed.ao->>'request_type'                                    AS request_type,
           COALESCE((parsed.ao->>'identity_verified')::boolean, false)   AS identity_verified,
           COALESCE((parsed.ao->>'end_conversation')::boolean, false)    AS end_conversation
    FROM scoped s,
    LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(s.message->'content') = 'object' THEN s.message->'content'->'output'
        WHEN jsonb_typeof(s.message->'content') = 'string' THEN safe_jsonb(s.message->>'content')->'output'
        ELSE NULL
      END AS ao
    ) parsed
    WHERE s.message->>'type' = 'ai'
      AND (s.message->'tool_calls' IS NULL
           OR jsonb_typeof(s.message->'tool_calls') != 'array'
           OR jsonb_array_length(s.message->'tool_calls') = 0)
      AND parsed.ao IS NOT NULL
  ),
  session_stats AS (
    SELECT session_id,
           COUNT(*)          AS msg_count,
           MAX(created_at)   AS latest,
           MIN(created_at)   AS earliest,
           jsonb_build_object(
             'human',  COUNT(*) FILTER (WHERE message->>'type' = 'human'),
             'ai',     COUNT(*) FILTER (WHERE message->>'type' = 'ai'),
             'tool',   COUNT(*) FILTER (WHERE message->>'type' = 'tool'),
             'system', COUNT(*) FILTER (WHERE message->>'type' = 'system')
           ) AS type_counts
    FROM scoped GROUP BY session_id
  ),
  session_tools_agg AS (
    SELECT session_id, array_agg(DISTINCT tool_name) AS tools
    FROM msg_tools GROUP BY session_id
  ),
  session_ai_agg AS (
    SELECT session_id,
           array_agg(DISTINCT category)     FILTER (WHERE category     IS NOT NULL) AS categories,
           array_agg(DISTINCT request_type) FILTER (WHERE request_type IS NOT NULL) AS request_types,
           bool_or(identity_verified)  AS has_verified,
           bool_or(end_conversation)   AS has_end_conversation
    FROM ai_meta GROUP BY session_id
  ),
  combined AS (
    SELECT
      ss.session_id, ss.msg_count, ss.latest, ss.earliest, ss.type_counts,
      COALESCE(sta.tools,         ARRAY[]::text[]) AS tools,
      COALESCE(saa.categories,    ARRAY[]::text[]) AS categories,
      COALESCE(saa.request_types, ARRAY[]::text[]) AS request_types,
      COALESCE(saa.has_verified,       false)      AS has_verified,
      COALESCE(saa.has_end_conversation, false)    AS has_end_conversation
    FROM session_stats ss
    LEFT JOIN session_tools_agg sta ON ss.session_id = sta.session_id
    LEFT JOIN session_ai_agg   saa ON ss.session_id = saa.session_id
  )
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.latest DESC)
  INTO   result
  FROM   combined c;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── RPC: get_filter_options ─────────────────────────────────────────────────
-- Scoped to last 7 days for performance on large tables.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_filter_options()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_since timestamptz := NOW() - INTERVAL '7 days';
  result jsonb;
BEGIN
  WITH
  tool_names AS (
    SELECT DISTINCT tc.val->>'name' AS name
    FROM   chat_messages cm,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(cm.message->'tool_calls') = 'array'
                   AND jsonb_array_length(cm.message->'tool_calls') > 0
                  THEN cm.message->'tool_calls' ELSE '[]'::jsonb END
           ) AS tc(val)
    WHERE  cm.created_at >= v_since
      AND  tc.val->>'name' IS NOT NULL
    UNION
    SELECT DISTINCT cm.message->>'name' AS name
    FROM   chat_messages cm
    WHERE  cm.created_at >= v_since
      AND  cm.message->>'type' = 'tool'
      AND  cm.message->>'name' IS NOT NULL
  ),
  category_names AS (
    SELECT DISTINCT parsed->>'request_category' AS name
    FROM (
      SELECT CASE
        WHEN jsonb_typeof(cm.message->'content') = 'object' THEN cm.message->'content'->'output'
        WHEN jsonb_typeof(cm.message->'content') = 'string' THEN safe_jsonb(cm.message->>'content')->'output'
        ELSE NULL
      END AS parsed
      FROM chat_messages cm
      WHERE cm.created_at >= v_since
        AND cm.message->>'type' = 'ai'
        AND (cm.message->'tool_calls' IS NULL
             OR jsonb_typeof(cm.message->'tool_calls') != 'array'
             OR jsonb_array_length(cm.message->'tool_calls') = 0)
    ) sub
    WHERE parsed->>'request_category' IS NOT NULL
  ),
  request_type_names AS (
    SELECT DISTINCT parsed->>'request_type' AS name
    FROM (
      SELECT CASE
        WHEN jsonb_typeof(cm.message->'content') = 'object' THEN cm.message->'content'->'output'
        WHEN jsonb_typeof(cm.message->'content') = 'string' THEN safe_jsonb(cm.message->>'content')->'output'
        ELSE NULL
      END AS parsed
      FROM chat_messages cm
      WHERE cm.created_at >= v_since
        AND cm.message->>'type' = 'ai'
        AND (cm.message->'tool_calls' IS NULL
             OR jsonb_typeof(cm.message->'tool_calls') != 'array'
             OR jsonb_array_length(cm.message->'tool_calls') = 0)
    ) sub
    WHERE parsed->>'request_type' IS NOT NULL
  )
  SELECT jsonb_build_object(
    'tools',         COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM tool_names),         '[]'::jsonb),
    'categories',    COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM category_names),     '[]'::jsonb),
    'request_types', COALESCE((SELECT jsonb_agg(name ORDER BY name) FROM request_type_names), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

-- ── Permissions ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION safe_jsonb(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_session_list(int, text, text, text, int, int, text[], text[], text[], text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_filter_options() TO anon, authenticated;
