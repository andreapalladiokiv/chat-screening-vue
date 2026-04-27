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

-- Drop old signatures so CREATE OR REPLACE works with the new parameter list
DROP FUNCTION IF EXISTS get_session_list(int, text, text, text, int, int, text[], text[], text[]);
DROP FUNCTION IF EXISTS get_session_list(int, text, text, text, int, int, text[], text[], text[], text);

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
  p_session_id    text     DEFAULT NULL,   -- substring search on session_id (searches ALL data)
  -- Visitor settings filters
  p_projects      text[]   DEFAULT NULL,   -- OR filter: session matches any selected project
  p_visitor_types text[]   DEFAULT NULL,   -- OR filter: session matches any selected visitor type
  p_languages     text[]   DEFAULT NULL,   -- OR filter: session matches any selected language
  p_validation    boolean  DEFAULT NULL,   -- exact match filter
  p_is_whatsapp   boolean  DEFAULT NULL,   -- exact match filter
  p_has_lead      boolean  DEFAULT NULL,   -- true = lead_id IS NOT NULL
  p_has_case      boolean  DEFAULT NULL,   -- true = case_id IS NOT NULL
  p_has_booking   boolean  DEFAULT NULL    -- true = booking_identifier IS NOT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_cursor    timestamptz := CASE WHEN p_cursor    IS NOT NULL THEN p_cursor::timestamptz    ELSE NULL END;
  v_date_from timestamptz := CASE WHEN p_date_from IS NOT NULL THEN p_date_from::timestamptz ELSE NULL END;
  v_date_to   timestamptz := CASE WHEN p_date_to   IS NOT NULL THEN p_date_to::timestamptz   ELSE NULL END;
  v_has_meta_filters boolean := (p_tools IS NOT NULL OR p_categories IS NOT NULL OR p_request_types IS NOT NULL);
  v_has_vs_filters boolean := (p_projects IS NOT NULL OR p_visitor_types IS NOT NULL OR p_languages IS NOT NULL
                               OR p_validation IS NOT NULL OR p_is_whatsapp IS NOT NULL
                               OR p_has_lead IS NOT NULL OR p_has_case IS NOT NULL OR p_has_booking IS NOT NULL);
  v_session_ids text[];
  result jsonb;
BEGIN

  -- ═══════════════════════════════════════════════════════════════════════════
  -- STAGE 1: Find candidate session IDs
  -- ═══════════════════════════════════════════════════════════════════════════

  IF NOT v_has_meta_filters AND NOT v_has_vs_filters THEN
    -- FAST PATH: No metadata or visitor-settings filters needed.
    -- Simple GROUP BY uses the session_id index — no JSONB parsing.
    -- When searching by p_session_id, also match visitors_settings.conversation_id.
    SELECT array_agg(sub.session_id) INTO v_session_ids
    FROM (
      SELECT cm.session_id
      FROM   chat_messages cm
      WHERE  (v_date_from IS NULL OR cm.created_at >= v_date_from)
        AND  (v_date_to   IS NULL OR cm.created_at <= v_date_to)
        AND  (p_session_id IS NULL
              OR cm.session_id ILIKE '%' || p_session_id || '%'
              OR cm.session_id IN (
                SELECT vs.session_id FROM visitors_settings vs
                WHERE vs.conversation_id ILIKE '%' || p_session_id || '%'
              ))
      GROUP BY cm.session_id
      HAVING (v_cursor  IS NULL OR MAX(cm.created_at) < v_cursor)
        AND  (p_msg_min IS NULL OR COUNT(*) >= p_msg_min)
        AND  (p_msg_max IS NULL OR COUNT(*) <= p_msg_max)
      ORDER BY MAX(cm.created_at) DESC
      LIMIT  p_limit
    ) sub;

  ELSE
    -- FILTERED PATH: Metadata or visitor-settings filters require extra joins.
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
        AND  (p_session_id IS NULL
              OR session_id ILIKE '%' || p_session_id || '%'
              OR session_id IN (
                SELECT vs.session_id FROM visitors_settings vs
                WHERE vs.conversation_id ILIKE '%' || p_session_id || '%'
              ))
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
      -- Supports both wrapped (content.output.request_category) and flat
      -- (content.request_category) AI message formats: COALESCE prefers the
      -- nested .output object when present, else falls back to content itself.
      SELECT b.session_id,
             parsed.ao->>'request_category' AS category,
             parsed.ao->>'request_type'     AS request_type
      FROM base b,
      LATERAL (
        SELECT COALESCE(content_obj->'output', content_obj) AS ao
        FROM (
          SELECT CASE
            WHEN jsonb_typeof(b.message->'content') = 'object' THEN b.message->'content'
            WHEN jsonb_typeof(b.message->'content') = 'string' THEN safe_jsonb(b.message->>'content')
            ELSE NULL
          END AS content_obj
        ) parsed_content
      ) parsed
      WHERE b.message->>'type' = 'ai'
        AND (b.message->'tool_calls' IS NULL
             OR jsonb_typeof(b.message->'tool_calls') != 'array'
             OR jsonb_array_length(b.message->'tool_calls') = 0)
        AND jsonb_typeof(parsed.ao) = 'object'
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
      LEFT JOIN visitors_settings vs  ON ss.session_id = vs.session_id
      WHERE (v_cursor    IS NULL OR ss.latest < v_cursor)
        AND (p_msg_min   IS NULL OR ss.msg_count >= p_msg_min)
        AND (p_msg_max   IS NULL OR ss.msg_count <= p_msg_max)
        AND (p_tools     IS NULL OR COALESCE(sta.tools, ARRAY[]::text[]) @> p_tools)
        AND (p_categories    IS NULL OR COALESCE(saa.categories, ARRAY[]::text[]) && p_categories)
        AND (p_request_types IS NULL OR COALESCE(saa.request_types, ARRAY[]::text[]) && p_request_types)
        -- Visitor settings filters
        AND (p_projects      IS NULL OR vs.project     = ANY(p_projects))
        AND (p_visitor_types IS NULL OR vs.type         = ANY(p_visitor_types))
        AND (p_languages     IS NULL OR vs.language     = ANY(p_languages))
        AND (p_validation    IS NULL OR COALESCE(vs.validation, false) = p_validation)
        AND (p_is_whatsapp   IS NULL OR COALESCE(vs.is_whatsapp, false) = p_is_whatsapp)
        AND (p_has_lead    IS NULL OR (p_has_lead    AND vs.lead_id              IS NOT NULL) OR (NOT p_has_lead    AND (vs.lead_id              IS NULL OR vs.session_id IS NULL)))
        AND (p_has_case    IS NULL OR (p_has_case    AND vs.case_id              IS NOT NULL) OR (NOT p_has_case    AND (vs.case_id              IS NULL OR vs.session_id IS NULL)))
        AND (p_has_booking IS NULL OR (p_has_booking AND vs.booking_identifier   IS NOT NULL) OR (NOT p_has_booking AND (vs.booking_identifier   IS NULL OR vs.session_id IS NULL)))
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
  -- Also joins visitors_settings for enrichment data.
  -- ═══════════════════════════════════════════════════════════════════════════
  WITH
  scoped AS (
    SELECT session_id, created_at, message
    FROM   chat_messages
    WHERE  session_id = ANY(v_session_ids)
      AND  (v_date_from IS NULL OR created_at >= v_date_from)
      AND  (v_date_to   IS NULL OR created_at <= v_date_to)
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
    -- Supports both wrapped (content.output.request_category) and flat
    -- (content.request_category) AI message formats: COALESCE prefers the
    -- nested .output object when present, else falls back to content itself.
    SELECT s.session_id,
           parsed.ao->>'request_category'                                AS category,
           parsed.ao->>'request_type'                                    AS request_type,
           COALESCE((parsed.ao->>'identity_verified')::boolean, false)   AS identity_verified,
           COALESCE((parsed.ao->>'end_conversation')::boolean, false)    AS end_conversation
    FROM scoped s,
    LATERAL (
      SELECT COALESCE(content_obj->'output', content_obj) AS ao
      FROM (
        SELECT CASE
          WHEN jsonb_typeof(s.message->'content') = 'object' THEN s.message->'content'
          WHEN jsonb_typeof(s.message->'content') = 'string' THEN safe_jsonb(s.message->>'content')
          ELSE NULL
        END AS content_obj
      ) parsed_content
    ) parsed
    WHERE s.message->>'type' = 'ai'
      AND (s.message->'tool_calls' IS NULL
           OR jsonb_typeof(s.message->'tool_calls') != 'array'
           OR jsonb_array_length(s.message->'tool_calls') = 0)
      AND jsonb_typeof(parsed.ao) = 'object'
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
  vs AS (
    SELECT session_id, project, type AS visitor_type, language,
           COALESCE(validation, false) AS validation,
           COALESCE(is_whatsapp, false) AS is_whatsapp,
           lead_id IS NOT NULL          AS has_lead,
           case_id IS NOT NULL          AS has_case,
           booking_identifier IS NOT NULL AS has_booking,
           request_id, masked_client_phone, conversation_id
    FROM   visitors_settings
    WHERE  session_id = ANY(v_session_ids)
  ),
  combined AS (
    SELECT
      ss.session_id, ss.msg_count, ss.latest, ss.earliest, ss.type_counts,
      COALESCE(sta.tools,         ARRAY[]::text[]) AS tools,
      COALESCE(saa.categories,    ARRAY[]::text[]) AS categories,
      COALESCE(saa.request_types, ARRAY[]::text[]) AS request_types,
      COALESCE(saa.has_verified,       false)      AS has_verified,
      COALESCE(saa.has_end_conversation, false)    AS has_end_conversation,
      -- Visitor settings enrichment
      vs.project, vs.visitor_type, vs.language, vs.validation, vs.is_whatsapp,
      COALESCE(vs.has_lead, false)    AS has_lead,
      COALESCE(vs.has_case, false)    AS has_case,
      COALESCE(vs.has_booking, false) AS has_booking,
      vs.request_id, vs.masked_client_phone, vs.conversation_id
    FROM session_stats ss
    LEFT JOIN session_tools_agg sta ON ss.session_id = sta.session_id
    LEFT JOIN session_ai_agg   saa ON ss.session_id = saa.session_id
    LEFT JOIN vs                    ON ss.session_id = vs.session_id
  )
  SELECT jsonb_agg(to_jsonb(c) ORDER BY c.latest DESC)
  INTO   result
  FROM   combined c;

  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;

-- ── RPC: get_filter_options ─────────────────────────────────────────────────
-- Two separate queries for speed: chat_messages scan (AI metadata) and
-- visitors_settings scan (visitor options). Each is lightweight on its own.
-- ────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_filter_options()
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_since timestamptz := NOW() - INTERVAL '3 days';
  v_tools jsonb;
  v_categories jsonb;
  v_request_types jsonb;
  v_projects jsonb;
  v_visitor_types jsonb;
  v_languages jsonb;
BEGIN

  -- ── AI metadata from chat_messages (scoped to last 3 days) ──
  SELECT COALESCE(jsonb_agg(DISTINCT name ORDER BY name), '[]'::jsonb) INTO v_tools
  FROM (
    SELECT tc.val->>'name' AS name
    FROM   chat_messages cm,
           LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(cm.message->'tool_calls') = 'array'
                   AND jsonb_array_length(cm.message->'tool_calls') > 0
                  THEN cm.message->'tool_calls' ELSE '[]'::jsonb END
           ) AS tc(val)
    WHERE  cm.created_at >= v_since AND tc.val->>'name' IS NOT NULL
    UNION
    SELECT cm.message->>'name'
    FROM   chat_messages cm
    WHERE  cm.created_at >= v_since AND cm.message->>'type' = 'tool' AND cm.message->>'name' IS NOT NULL
  ) t;

  -- Supports both wrapped (content.output.request_category) and flat
  -- (content.request_category) AI message formats: COALESCE prefers the
  -- nested .output object when present, else falls back to content itself.
  SELECT COALESCE(jsonb_agg(DISTINCT name ORDER BY name), '[]'::jsonb) INTO v_categories
  FROM (
    SELECT parsed->>'request_category' AS name
    FROM (
      SELECT COALESCE(content_obj->'output', content_obj) AS parsed
      FROM (
        SELECT CASE
          WHEN jsonb_typeof(cm.message->'content') = 'object' THEN cm.message->'content'
          WHEN jsonb_typeof(cm.message->'content') = 'string' THEN safe_jsonb(cm.message->>'content')
          ELSE NULL
        END AS content_obj
        FROM chat_messages cm
        WHERE cm.created_at >= v_since
          AND cm.message->>'type' = 'ai'
          AND (cm.message->'tool_calls' IS NULL
               OR jsonb_typeof(cm.message->'tool_calls') != 'array'
               OR jsonb_array_length(cm.message->'tool_calls') = 0)
      ) parsed_content
    ) sub
    WHERE jsonb_typeof(parsed) = 'object' AND parsed->>'request_category' IS NOT NULL
  ) c;

  SELECT COALESCE(jsonb_agg(DISTINCT name ORDER BY name), '[]'::jsonb) INTO v_request_types
  FROM (
    SELECT parsed->>'request_type' AS name
    FROM (
      SELECT COALESCE(content_obj->'output', content_obj) AS parsed
      FROM (
        SELECT CASE
          WHEN jsonb_typeof(cm.message->'content') = 'object' THEN cm.message->'content'
          WHEN jsonb_typeof(cm.message->'content') = 'string' THEN safe_jsonb(cm.message->>'content')
          ELSE NULL
        END AS content_obj
        FROM chat_messages cm
        WHERE cm.created_at >= v_since
          AND cm.message->>'type' = 'ai'
          AND (cm.message->'tool_calls' IS NULL
               OR jsonb_typeof(cm.message->'tool_calls') != 'array'
               OR jsonb_array_length(cm.message->'tool_calls') = 0)
      ) parsed_content
    ) sub
    WHERE jsonb_typeof(parsed) = 'object' AND parsed->>'request_type' IS NOT NULL
  ) r;

  -- ── Visitor options from visitors_settings directly (no chat_messages join) ──
  SELECT COALESCE(jsonb_agg(DISTINCT project ORDER BY project), '[]'::jsonb)
  INTO v_projects
  FROM visitors_settings WHERE project IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT type ORDER BY type), '[]'::jsonb)
  INTO v_visitor_types
  FROM visitors_settings WHERE type IS NOT NULL;

  SELECT COALESCE(jsonb_agg(DISTINCT language ORDER BY language), '[]'::jsonb)
  INTO v_languages
  FROM visitors_settings WHERE language IS NOT NULL;

  RETURN jsonb_build_object(
    'tools',         v_tools,
    'categories',    v_categories,
    'request_types', v_request_types,
    'projects',      v_projects,
    'visitor_types', v_visitor_types,
    'languages',     v_languages
  );
END;
$$;

-- ── Permissions ──────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION safe_jsonb(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_session_list(int, text, text, text, int, int, text[], text[], text[], text, text[], text[], text[], boolean, boolean, boolean, boolean, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_filter_options() TO anon, authenticated;
