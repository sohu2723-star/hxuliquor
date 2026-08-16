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

test("returns a useful message for a non-JSON Apps Script error", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GAS_URL;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GAS_URL;
    else process.env.GAS_URL = originalUrl;
  });

  process.env.GAS_URL = "https://script.google.com/macros/s/deployment/exec";
  globalThis.fetch = async () =>
    new Response("<html>Sign in</html>", { status: 403 });

  const response = createResponse();
  await handler(
    { method: "POST", query: { action: "googleLogin" }, body: "{}" },
    response,
  );

  assert.equal(response.statusCode, 502);
  assert.match(response.body.message, /deployment access and authorization/);
});

test("rejects a GAS_URL that is not an Apps Script exec deployment", async (context) => {
  const originalUrl = process.env.GAS_URL;
  context.after(() => originalUrl === undefined ? delete process.env.GAS_URL : process.env.GAS_URL = originalUrl);
  process.env.GAS_URL = "https://script.google.com/home/projects/example/edit";
  const response = createResponse();
  await handler({ method: "POST", query: { action: "addEmployee" }, body: "{}" }, response);
  assert.equal(response.statusCode, 500);
  assert.match(response.body.message, /GAS_URL/);
  assert.match(response.body.message, /\/exec/);
});

test("explains how to recover from a removed Apps Script deployment", async (context) => {
  const originalFetch = globalThis.fetch;
  const originalUrl = process.env.GAS_URL;
  context.after(() => {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.GAS_URL;
    else process.env.GAS_URL = originalUrl;
  });
  process.env.GAS_URL = "https://script.google.com/macros/s/deployment/exec";
  globalThis.fetch = async () => new Response("Not found", { status: 404 });
  const response = createResponse();
  await handler({ method: "POST", query: { action: "addEmployee" }, body: "{}" }, response);
  assert.equal(response.statusCode, 502);
  assert.match(response.body.message, /HTTP 404/);
  assert.match(response.body.message, /Redeploy/);
});
