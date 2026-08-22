
              SELECT COALESCE(MIN(created_at), NOW()) AS epoch
                FROM capability_invocations