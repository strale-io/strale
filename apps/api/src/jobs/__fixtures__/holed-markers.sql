
        SELECT capability_slug AS slug, COUNT(*)::int AS n
        FROM health_monitor_events
        WHERE event_type = ${FACT_WRITE_FAILED_EVENT}
          AND created_at > NOW() - INTERVAL '30 days'
          AND capability_slug IS NOT NULL
        GROUP BY capability_slug