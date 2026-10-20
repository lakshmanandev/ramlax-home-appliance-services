# API notes

All API routes are under `/api/v1`. Public booking creation has a 30 requests / 15 minute limiter. Admin routes require a valid short-lived, HttpOnly JWT cookie. Configure the CORS allowlist with the deployed web origin.

## Create booking

`POST /bookings` with a required random `Idempotency-Key` header. Required JSON fields: customer name and phone, service slug, service type, configured city slug, configured area, address, preferred date (`YYYY-MM-DD`), preferred window, and `termsAccepted: true`. Optional appliance details, landmark, email and marketing consent. The server verifies location/service compatibility; reference and price snapshot are server generated. The response includes a secret lookup access key; retain it with the reference. Response status is requested, never confirmed.

The catalog is seeded idempotently when the API connects to MongoDB. A type's pricing object accepts one of `{ "kind":"fixed", "amount":1200, "currency":"INR", "additionalCharges":[] }`, `{ "kind":"starting", "amount":800, ... }`, or `{ "kind":"quote", "currency":"INR", ... }`. Fixed and starting modes require a non-negative amount. Additional charges are server-configured. Each availability entry is `{ "city":"bengaluru", "areas":["Indiranagar"], "active":true }`; an empty area list means all configured areas in that city. No location rule means no customer can request that type there.

## Service catalog administration

All routes require an administrator cookie. `GET|POST /admin/services` lists or creates categories; `PATCH|DELETE /admin/services/:id` updates or archives one. `GET|POST /admin/services/:serviceId/types` lists or creates types; `PATCH|DELETE /admin/services/:serviceId/types/:typeId` updates pricing/coverage or archives a type. Deletes are soft archives so past bookings and price snapshots remain intact. Availability writes validate active city slugs and configured area names.

## Status transitions

`requested → confirmed | rejected | cancelled`; `confirmed → in_progress | cancelled`; `in_progress → completed | cancelled`. Terminal states cannot transition. Admin state changes and technician assignments create audit entries.

## Customer lookup, reviews, reports and notifications

`POST /bookings/lookup` requires the booking reference and original access key. It returns status and appointment details without customer contact or address. `POST /reviews` accepts a rating/text/name with the same credentials and only for completed bookings. Reviews stay hidden from `GET /reviews` until an admin approves them. Admins can list/moderate reviews using `GET /admin/reviews` and `PATCH /admin/reviews/:id`. `GET /admin/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` aggregates requests by status, service and city, completed jobs, cancellation rate, estimated booking value and separately recorded payments. Actual received amounts can be entered with `PATCH /admin/bookings/:id/payment`. Admin event notifications are listed at `GET /admin/notifications`; external message providers are not enabled.

## Contact enquiries

`POST /contact` validates and persists a customer enquiry. Admins can review paginated submissions with `GET /admin/contacts`, optionally filtered by `status=new|reviewed|closed`. Owners and admins can update a submission with `PATCH /admin/contacts/:id/status` and `{ "status": "reviewed" }` (or `new`/`closed`). The Admin inbox links customer phone numbers and shows a periodically refreshed count of new enquiries. No external email/SMS provider is configured.

The API also serves Socket.IO on the same HTTP port. Admin sockets must present the current HttpOnly access cookie and an allowed `WEB_ORIGIN`; only authenticated owner/admin/staff sessions join the admin event room. New enquiries and booking changes emit invalidation events, so open Admin pages refresh immediately. Admins can optionally enable browser desktop alerts from the sidebar; permission is requested only after the user clicks the button, and alerts are only shown when the Admin tab is in the background. Socket sessions disconnect at JWT expiry and on logout. Clients should keep the existing HTTP query refresh as a fallback if a proxy or deployment does not support WebSocket upgrades.

## Authenticated workflows

Bootstrap the first owner using the environment-backed command in the root README. Login is rate limited, issues a 20-minute HttpOnly cookie, verifies JWT issuer/audience and current account activity/role on each request, and logout clears the cookie. Owner/admin roles manage configuration; staff accounts have read access to those configuration areas. Login accepts email/password; logout clears the cookie. Admin requests list and filter by status and text (`q`), with page/limit pagination. Assignment requires an active technician whose skill, city and optional area match the booking.
