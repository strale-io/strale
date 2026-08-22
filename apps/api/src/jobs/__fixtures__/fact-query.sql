
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
                   'fact'::text AS source,
                   NULL::text AS status, NULL::text AS error,
                   f.success, f.counts_against_capability AS counts,
                   date_trunc('day', f.created_at)::date::text AS day,
                   (f.created_at > NOW() - INTERVAL '7 days') AS recent,
                   COUNT(*)::int AS n
            FROM scope s
            JOIN capability_invocations f ON f.capability_slug = s.slug
            WHERE f.created_at >= GREATEST(s.win_start, ${epoch}::timestamptz)
              AND f.context_kind = 'customer_paid'
              AND f.is_free_tier = false
              AND (f.user_id IS NULL OR f.user_id NOT IN (
                SELECT id FROM users
                WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
                   OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
              ))
            GROUP BY s.slug, s.lifecycle_state, s.visible, s.x402_enabled,
                     f.success, f.counts_against_capability, day, recent