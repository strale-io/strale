
        WITH scope AS (
          SELECT c.id, c.slug,
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
        SELECT s.slug, COALESCE(SUM(rt.price_cents), 0)::int AS cents
        FROM scope s
        JOIN transactions rt ON rt.capability_id = s.id
        WHERE rt.created_at > s.win_start
          AND rt.status = 'completed'
          AND rt.deleted_at IS NULL
          AND COALESCE(rt.is_free_tier, false) = false
          AND (rt.user_id IS NULL OR rt.user_id NOT IN (
            SELECT id FROM users
            WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
               OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
          ))
        GROUP BY s.slug