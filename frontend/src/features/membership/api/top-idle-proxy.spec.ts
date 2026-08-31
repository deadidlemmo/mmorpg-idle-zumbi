import assert from "node:assert/strict";
import { test } from "node:test";
import { onRequestPost } from "../../../../functions/webhooks/topidle";

test("encaminha ao backend o corpo e os cabeçalhos assinados sem alteração", async () => {
  const originalFetch = globalThis.fetch;
  const rawBody = '{"eventId":"vote-event-1", "playerIdentifier":"code-1"}';
  let forwardedRequest: Request | null = null;

  globalThis.fetch = async (input, init) => {
    forwardedRequest = new Request(input, init);
    return new Response(null, { status: 204 });
  };

  try {
    const response = await onRequestPost({
      request: new Request("https://deadidle.pages.dev/webhooks/topidle", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-TopIdle-Timestamp": "1788177600",
          "X-TopIdle-Signature": "sha256=signature",
          "X-TopIdle-Vote-Id": "vote-event-1",
          "Idempotency-Key": "vote-event-1",
        },
        body: rawBody,
      }),
    });

    assert.equal(response.status, 204);
    assert.ok(forwardedRequest);
    assert.equal(
      forwardedRequest.url,
      "https://deadidle-api.botpokeidle.com.br/webhooks/topidle",
    );
    assert.equal(await forwardedRequest.text(), rawBody);
    assert.equal(
      forwardedRequest.headers.get("x-topidle-timestamp"),
      "1788177600",
    );
    assert.equal(
      forwardedRequest.headers.get("x-topidle-signature"),
      "sha256=signature",
    );
    assert.equal(
      forwardedRequest.headers.get("x-topidle-vote-id"),
      "vote-event-1",
    );
    assert.equal(
      forwardedRequest.headers.get("idempotency-key"),
      "vote-event-1",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
