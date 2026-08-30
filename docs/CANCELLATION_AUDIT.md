Cancellation audit reason codes

This project records subscription cancellation audit entries in `subscription_cancellations` (see backend/audit-trail/schema.sql).

New structured reason codes (introduced to improve reporting and analytics):

- CONTRIBUTOR_WITHDREW — The subscriber/owner invoked cancellation (voluntary withdrawal).
- MAINTAINER_REVOKED — A maintainer or operator revoked the subscription on behalf of the subscriber.
- TTL_EXPIRED — A backend reconciliation or TTL caused the subscription to be considered expired/cancelled.
- ADMIN_CANCELLED — An administrator manually cancelled the subscription for operational or compliance reasons.

Implementation notes

- The database schema adds a `reason_code` TEXT column with a CHECK constraint limiting values to the four codes above. Free-text `reason` remains for optional human-entered explanation.
- The Cancellation Audit API (`/api/subscriptions/cancellations` and `GET /api/merchants/{merchantAddress}/cancellations`) exposes an optional `reasonCode` field in the request and response payloads.
- Prefer using `reasonCode` for structured reporting. Keep `reason` for human context when necessary.

Migration notes

- Deploy a migration that alters `subscription_cancellations` to add the `reason_code` column and the CHECK constraint.
- Existing rows will have `reason_code = NULL`.

Security & privacy

- `reason` may contain customer-provided text. Do not include free-text reasons in logs or broadly-exported analytics without redaction.
- `reasonCode` is safe to aggregate and use in dashboards.
