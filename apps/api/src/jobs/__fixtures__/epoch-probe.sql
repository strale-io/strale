
        SELECT
          to_regclass('public.capability_invocations') IS NOT NULL AS ready,
          EXISTS (
            SELECT 1 FROM pg_trigger
            WHERE tgname = 'capability_invocations_immutable_trg'
              AND tgrelid = to_regclass('public.capability_invocations')
          ) AS "protected"