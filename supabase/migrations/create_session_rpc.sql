-- ============================================================================
-- Migration Step 1 of 2: Functions (run this FIRST in Supabase SQL Editor)
-- ============================================================================
-- Creates:
--   1. safe_jsonb(text)         — error-tolerant text→jsonb cast
--   2. get_session_list(...)    — paginated, filterable session summaries
--   3. get_filter_options()     — distinct tools / categories / request types
--
-- Safe to run multiple times (CREATE OR REPLACE).
-- ============================================================================

-- ── Helper: safe JSON cast ──────────────────────────────────────────────────
-- Returns NULL instead of raising on malformed JSON strings.
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

-- ── RPC: get_session_list ───────────────────────────────────────────────────
-- Returns a JSON array of session summary objects, supporting:
--   • cursor-based pagination  (p_cursor = ISO timestamp of oldest loaded session)
--   • date range filtering     (p_date_from / p_date_to as ISO strings)
--   • message count filtering  (p_msg_min / p_msg_max)
--   • tool / category / request-type filtering (text arrays, AND / OR semantics)
--
-- Called from the frontend as:
--   db.rpc('get_session_list', { p_limit: 50, p_cursor: '...', ... })
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_session_list(
  p_limit         int      DEFAULT 50,
  p_cursor        text     DEFAULT NULL,   -- load sessions with latest < this timestamp
  p_date_from     text     DEFAULT NULL,   -- inclusive lower bound (ISO string)
  p_date_to       text     DEFAULT NULL,   -- inclusive upper bound (ISO string)
  p_msg_min       int      DEFAULT NULL,
  p_msg_max       int      DEFAULT NULL,
  p_tools         text[]   DEFAULT NULL,   -- session must contain ALL these tools
  p_categories    text[]   DEFAULT NULL,   -- session must match ANY of these categories
  p_request_types text[]   DEFAULT NULL    -- session must match ANY of these request types
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_cursor    timestamptz := CASE WHEN p_cursor    IS NOT NULL THEN p_cursor::timestamptz    ELSE NULL END;
  v_date_from timestamptz := CASE WHEN p_date_from IS NOT NULL THEN p_date_from::timestamptz ELSE NULL END;
  v_date_to   timestamptz := CASE WHEN p_date_to   IS NOT NULL THEN p_date_to::timestamptz   ELSE NULL END;
  result jsonb;
BEGIN
  WITH
  -- 1. Base rows scoped to the requested date window
  base AS (
    SELECT session_id, created_at, message
    FROM   chat_messages
    WHERE  (v_date_from IS NULL OR created_at >= v_date_from)
      AND  (v_date_to   IS NULL OR created_at <= v_date_to)
  ),

  -- 2. Extract tool names from tool_calls arrays AND tool-type messages
  msg_tools AS (
    SELECT DISTINCT b.session_id, tc.val->>'name' AS tool_name
    FROM   base b,
           LATERAL jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(b.message->'tool_calls') = 'array'
                AND jsonb_array_length(b.message->'tool_calls') > 0
               THEN b.message->'tool_calls'
               ELSE '[]'::jsonb
             END
           ) AS tc(val)
    WHERE  tc.val->>'name' IS NOT NULL

    UNION

    SELECT DISTINCT b.session_id, b.message->>'name' AS tool_name
    FROM   base b
    WHERE  b.message->>'type' = 'tool'
      AND  b.message->>'name' IS NOT NULL
  ),

  -- 3. Extract AI output metadata from final AI responses
  ai_meta AS (
    SELECT
      b.session_id,
      parsed.ao->>'request_category'                          AS category,
      parsed.ao->>'request_type'                              AS request_type,
      COALESCE((parsed.ao->>'identity_verified')::boolean, false)  AS identity_verified,
      COALESCE((parsed.ao->>'end_conversation')::boolean, false)   AS end_conversation
    FROM base b,
    LATERAL (
      SELECT CASE
        WHEN jsonb_typeof(b.message->'content') = 'object'
          THEN b.message->'content'->'output'
        WHEN jsonb_typeof(b.message->'content') = 'string'
          THEN safe_jsonb(b.message->>'content')->'output'
        ELSE NULL
      END AS ao
    ) parsed
    WHERE  b.message->>'type' = 'ai'
      AND  (b.message->'tool_calls' IS NULL
            OR jsonb_typeof(b.message->'tool_calls') != 'array'
            OR jsonb_array_length(b.message->'tool_calls') = 0)
      AND  parsed.ao IS NOT NULL
  ),

  -- 4. Basic per-session statistics
  session_stats AS (
    SELECT
      b.session_id,
      COUNT(*)                                             AS msg_count,
      MAX(b.created_at)                                    AS latest,
      MIN(b.created_at)                                    AS earliest,
      jsonb_build_object(
        'human',  COUNT(*) FILTER (WHERE b.message->>'type' = 'human'),
        'ai',     COUNT(*) FILTER (WHERE b.message->>'type' = 'ai'),
        'tool',   COUNT(*) FILTER (WHERE b.message->>'type' = 'tool'),
        'system', COUNT(*) FILTER (WHERE b.message->>'type' = 'system')
      ) AS type_counts
    FROM base b
    GROUP BY b.session_id
  ),

  -- 5. Aggregate tools per session
  session_tools_agg AS (
    SELECT session_id, array_agg(DISTINCT tool_name) AS tools
    FROM   msg_tools
    GROUP BY session_id
  ),

  -- 6. Aggregate AI metadata per session
  session_ai_agg AS (
    SELECT
      session_id,
      array_agg(DISTINCT category)     FILTER (WHERE category     IS NOT NULL) AS categories,
      array_agg(DISTINCT request_type) FILTER (WHERE request_type IS NOT NULL) AS request_types,
      bool_or(identity_verified)  AS has_verified,
      bool_or(end_conversation)   AS has_end_conversation
    FROM ai_meta
    GROUP BY session_id
  ),

  -- 7. Combine everything
  combined AS (
    SELECT
      ss.session_id,
      ss.msg_count,
      ss.latest,
      ss.earliest,
      ss.type_counts,
      COALESCE(sta.tools,         ARRAY[]::text[]) AS tools,
      COALESCE(saa.categories,    ARRAY[]::text[]) AS categories,
      COALESCE(saa.request_types, ARRAY[]::text[]) AS request_types,
      COALESCE(saa.has_verified,       false)      AS has_verified,
      COALESCE(saa.has_end_conversation, false)    AS has_end_conversation
    FROM session_stats ss
    LEFT JOIN session_tools_agg sta ON ss.session_id = sta.session_id
    LEFT JOIN session_ai_agg   saa ON ss.session_id = saa.session_id
  )

  -- 8. Apply post-aggregation filters, sort, limit
  SELECT jsonb_agg(row_to_jsonb(c))
  INTO   result
  FROM (
    SELECT *
    FROM   combined
    WHERE  (v_cursor IS NULL       OR latest < v_cursor)
      AND  (p_msg_min IS NULL      OR msg_count >= p_msg_min)
      AND  (p_msg_max IS NULL      OR msg_count <= p_msg_max)
      AND  (p_tools IS NULL        OR tools @> p_tools)          -- session has ALL requested tools
      AND  (p_categories IS NULL   OR categories && p_categories) -- session has ANY requested category
      AND  (p_request_types IS NULL OR request_types && p_request_types)
    ORDER BY latest DESC
    LIMIT  p_limit
  ) c;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── RPC: get_filter_options ─────────────────────────────────────────────────
-- Returns a single JSON object with all distinct filter values:
--   { tools: [...], categories: [...], request_types: [...] }
-- Called once at login to populate the filter dropdowns.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_filter_options()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH
  tool_names AS (
    SELECT DISTINCT tc.val->>'name' AS name
    FROM   chat_messages cm,
           LATERAL jsonb_array_elements(
             CASE
               WHEN jsonb_typeof(cm.message->'tool_calls') = 'array'
                AND jsonb_array_length(cm.message->'tool_calls') > 0
               THEN cm.message->'tool_calls'
               ELSE '[]'::jsonb
             END
           ) AS tc(val)
    WHERE  tc.val->>'name' IS NOT NULL

    UNION

    SELECT DISTINCT cm.message->>'name' AS name
    FROM   chat_messages cm
    WHERE  cm.message->>'type' = 'tool'
      AND  cm.message->>'name' IS NOT NULL
  ),

  category_names AS (
    SELECT DISTINCT parsed->>'request_category' AS name
    FROM (
      SELECT CASE
        WHEN jsonb_typeof(cm.message->'content') = 'object'
          THEN cm.message->'content'->'output'
        WHEN jsonb_typeof(cm.message->'content') = 'string'
          THEN safe_jsonb(cm.message->>'content')->'output'
        ELSE NULL
      END AS parsed
      FROM chat_messages cm
      WHERE cm.message->>'type' = 'ai'
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
        WHEN jsonb_typeof(cm.message->'content') = 'object'
          THEN cm.message->'content'->'output'
        WHEN jsonb_typeof(cm.message->'content') = 'string'
          THEN safe_jsonb(cm.message->>'content')->'output'
        ELSE NULL
      END AS parsed
      FROM chat_messages cm
      WHERE cm.message->>'type' = 'ai'
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
-- Required so the Supabase anon/authenticated roles can call these RPCs.
GRANT EXECUTE ON FUNCTION safe_jsonb(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_session_list(int, text, text, text, int, int, text[], text[], text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_filter_options() TO anon, authenticated;
