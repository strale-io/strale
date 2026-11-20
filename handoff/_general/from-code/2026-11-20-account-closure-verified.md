Intent: check whether the customer account closure Petter approved on 2026-11-16 actually ran, after the 11-17 and 11-19 notes listed it as open.

# 2026-11-20 Account closure: done on 2026-11-16, now verified

The closure was done on 2026-11-16 from Petter's PC. The notes of 2026-11-17 and 2026-11-19 carried it as open because nothing in the repo recorded the run. Evidence (Railway HTTP logs for the `strale` service, read 2026-11-20; times in Swedish time):

- 23:37 `POST /v1/admin/accounts/close` returned 404, which this route answers when no account has the given email.
- 23:41 `GET /v1/admin/users` returned 200 (account lookup).
- 23:47 `DELETE /v1/auth/me` returned 200. This is the self-service closure, and it runs the same closure plan as the admin route (#1080).
- 23:51 Petter's reply to the customer ("Re: Shut down API") confirms the account is closed and the key switched off.

All four calls came from the same PC address within 14 minutes. The closure is done and the customer has been told. No refund was asked for, none is owed, and none was made.

Note: the closure ran through the customer's own key, which the 11-16 note had ruled out (wow-core#348). The admin call likely missed on the email address. The outcome is identical, and the key is now revoked.

Removed from the queue: item 2 of `2026-11-19-master-takeover-hotmail-ra.md` and item 6 of `2026-11-17-master-takeover-1fg.md`.

Next authorised action: daily production run once the read-only DB URL is reachable from a cloud session (STRALE_DB_READONLY_URL in Bitwarden) or from the PC session | Owner: Strale master | Blocker: Petter (Bitwarden entry) or the PC session
