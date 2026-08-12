import assert from "node:assert/strict";
import test from "node:test";

import handler from "./gas.js";

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: undefined,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("rejects unsupported actions without contacting Apps Script", async () => {
  const response = createResponse();
  await handler(
    { method: "POST", query: { action: "unknown" }, body: "{}" },
    response,
  );
  assert.equal(response.statusCode, 400);
  assert.deepEqual(response.body, {
    success: false,
    message: "Invalid action",
  });
});

test("forwards an allowed request and returns parsed JSON", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GAS_URL;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GAS_URL;
    else process.env.GAS_URL = originalUrl;
  });

  process.env.GAS_URL = "https://script.google.com/macros/s/deployment/exec";
  globalThis.fetch = async (url, options) => {
    assert.equal(url.searchParams.get("action"), "googleLogin");
    assert.equal(options.method, "POST");
    assert.equal(options.body, '{"idToken":"token"}');
    return new Response('{"success":true,"user":{"id":"1"}}');
  };

  const response = createResponse();
  await handler(
    {
      method: "POST",
      query: { action: "googleLogin" },
      body: '{"idToken":"token"}',
    },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(response.body, { success: true, user: { id: "1" } });
});
