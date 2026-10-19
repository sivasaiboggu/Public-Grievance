import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ApiError, createClient, transitions } from "../src/index.ts";

const originalFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = originalFetch; });

test("authenticated requests attach the bearer header", async () => {
  let received = "";
  globalThis.fetch = async (_url, options) => {
    received = new Headers(options?.headers).get("Authorization") || "";
    return new Response(JSON.stringify({items: [], total: 0, offset: 0, limit: 25}));
  };
  await createClient("http://localhost:8000/", "example-token").list();
  assert.equal(received, "Bearer example-token");
});
test("validation errors are readable", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({detail: [{loc: ["body", "title"], msg: "Too short"}]}), {status: 422});
  await assert.rejects(createClient("http://localhost").get("id"), (e: unknown) => e instanceof ApiError && e.message === "title: Too short");
});
test("conflict status is preserved", async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({detail: "Refresh before updating"}), {status: 409});
  await assert.rejects(createClient("http://localhost").update("id", "under_review", "reviewed", 1), (e: unknown) => e instanceof ApiError && e.status === 409);
});
test("network failures are actionable", async () => {
  globalThis.fetch = async () => { throw new TypeError("connection refused"); };
  await assert.rejects(createClient("http://localhost").config(), /Cannot reach the server/);
});
test("multipart uploads do not set a broken content type", async () => {
  globalThis.fetch = async (_url, options) => {
    assert.equal(new Headers(options?.headers).has("Content-Type"), false);
    return new Response(JSON.stringify({id: "photo"}));
  };
  const form = new FormData(); form.append("file", new Blob(["test"]), "test.jpg");
  await createClient("http://localhost", "token").upload("GG-ID", form);
});
test("disposal cannot skip initial review in the client", () => {
  assert.deepEqual(transitions.submitted, ["under_review"]);
});
