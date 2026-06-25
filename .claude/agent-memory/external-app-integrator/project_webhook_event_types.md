---
name: OutboundWebhookEventType feature
description: Dedicated table for per-webhook event type definitions with label, remark, and JSON schema fields
type: project
---

A new model `OutboundWebhookEventType` (table: `outbound_webhook_event_types`) was added to support structured event type management per webhook receiver.

**Why:** Auto-extracted `ObservedEventTypes` on `OutboundWebhook` was a flat JSON string list with no metadata. Users needed per-event-type Chinese labels, remarks, and JSON schema documentation.

**How to apply:** When extending webhook-related integrations, event type metadata is now queryable via `GET /api/outbound/webhooks/:id/event-types`. Use this to present named, documented event types to external consumers rather than raw string lists.

Key facts:
- GORM composite uniqueIndex `uix_webhook_event_type` on `(webhook_id, event_type)` enforced at DB level
- Application-level duplicate check also present in `CreateOutboundWebhookEventType` and `UpdateOutboundWebhookEventType`
- CRUD handlers: `server/api/outbound_webhook_event_type.go`
- Routes nested under `ob` group (requires `admin` or `operator` role)
- Frontend section added to `OutboundWebhookDebug.vue` as an `el-card` between the auth/decrypt config card and the cURL simulation card
- Frontend API helpers added to `web/src/api/outbound.js`: `listWebhookEventTypes`, `createWebhookEventType`, `updateWebhookEventType`, `deleteWebhookEventType`
