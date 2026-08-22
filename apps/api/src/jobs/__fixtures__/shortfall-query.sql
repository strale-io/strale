
    WITH txn AS (
      SELECT c.slug, COUNT(*)::int AS n
      FROM capabilities c
      JOIN transactions t ON t.capability_id = c.id
      WHERE c.is_active = true
        AND t.created_at >= ${windowStart}::timestamptz
        AND t.status IN ('completed', 'failed')
        AND t.deleted_at IS NULL
        AND COALESCE(t.is_free_tier, false) = false
        AND (t.user_id IS NULL OR t.user_id NOT IN (
          SELECT id FROM users
          WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
             OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
        ))
      GROUP BY c.slug
    ),
    fct AS (
      SELECT capability_slug AS slug, COUNT(*)::int AS n
      FROM capability_invocations
      WHERE created_at >= ${windowStart}::timestamptz
        AND context_kind = 'customer_paid'
        AND is_free_tier = false
        -- Same exclusion as the transaction side. Without it the two CTEs count
        -- different populations: facts inflated relative to transactions, which
        -- biases the check toward SILENCE. That is the unsafe direction, since
        -- silence means the floor proceeds on evidence that may be holed.
        AND (user_id IS NULL OR user_id NOT IN (
          SELECT id FROM users
          WHERE email LIKE ANY(${INTERNAL_EMAIL_LIKE_PATTERNS})
             OR email = ANY(${EXTRA_EXCLUDED_EMAILS})
        ))
      GROUP BY capability_slug
    )
    SELECT txn.slug, COALESCE(fct.n, 0) AS facts, txn.n AS txns
    FROM txn LEFT JOIN fct ON fct.slug = txn.slug
    WHERE txn.n > 0