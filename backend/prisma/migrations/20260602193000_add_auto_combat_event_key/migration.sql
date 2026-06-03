-- Adds an optional idempotency key for realtime auto-combat events.
-- NULL remains allowed so existing events and event types without a stable key
-- keep their current behavior.
ALTER TABLE "auto_combat_session_events"
ADD COLUMN "eventKey" TEXT;

CREATE UNIQUE INDEX "auto_combat_session_events_sessionId_eventKey_key"
ON "auto_combat_session_events"("sessionId", "eventKey");
