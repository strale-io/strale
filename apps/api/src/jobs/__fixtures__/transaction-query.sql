
        WITH scope AS (
          SELECT c.id, c.slug, c.lifecycle_state, c.visible, c.x402_enabled,
                 GREATEST(
                   NOW() - INTERVAL '30 days',
                   COALESCE(lp.promoted_at, '-infinity'::timestamptz)
                 ) AS win_start
          FROM capabilities c
          LEFT JOIN LATERAL (
            SELECT MAX(e.created_at) AS promoted_at
            FROM health_monitor_events e
            WHERE e.capability_slug = c.slug
              AND e.event_type = 'capability_promotion'
              AND e.action_taken LIKE 'promoted%'
              AND e.details->>'mode' = 'enforce'
          ) lp ON true
          WHERE c.is_active = true
        )
        SELECT s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
               'transaction'::text AS source,
               t.status, t.error,
               NULL::boolean AS success, NULL::boolean AS counts,
               date_trunc('day', t.created_at)::date::text AS day,
               (t.created_at > NOW() - INTERVAL '7 days') AS recent,
               COUNT(*)::int AS n
        FROM scope s
        JOIN transactions t ON t.capability_id = s.id
        WHERE t.created_at > s.win_start
          AND t.created_at < ${epoch}::timestamptz
          AND t.status IN ('completed', 'failed')
          AND t.deleted_at IS NULL
          AND COALESCE(t.is_free_tier, false) = false
          AND (t.user_id IS NULL OR t.user_id NOT IN (
            SELECT id FROM users
            WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
               OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
          ))
        GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                 t.status, t.error, day, recent