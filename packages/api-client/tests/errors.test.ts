import test from "node:test";
import assert from "node:assert/strict";
import {
  getErrorMessage,
  humanizeValidationMessage,
  toList,
  formatDate,
  formatDateTime,
  formatDuration,
  formatPlural,
  ApiError,
} from "../src/index.ts";

test("getErrorMessage handles FastAPI validation error array without leaking objects", () => {
  const fastApiValidationError = {
    detail: [
      {
        type: "string_too_short",
        loc: ["body", "note"],
        msg: "String should have at least 10 characters",
        input: "short",
      },
    ],
  };

  const message = getErrorMessage(fastApiValidationError);
  assert.equal(typeof message, "string");
  assert.equal(message, "note: Please enter at least 10 characters.");
});

test("getErrorMessage handles multiple validation errors", () => {
  const multiError = {
    detail: [
      { loc: ["body", "title"], msg: "Field required" },
      { loc: ["body", "email"], msg: "value is not a valid email address" },
    ],
  };

  const message = getErrorMessage(multiError);
  assert.equal(typeof message, "string");
  assert.equal(message, "title: This field is required.; email: Please enter a valid email address.");
});

test("getErrorMessage handles string detail and Error instances", () => {
  assert.equal(getErrorMessage("Direct error message"), "Direct error message");
  assert.equal(getErrorMessage(new Error("Standard error message")), "Standard error message");
  assert.equal(getErrorMessage(new ApiError(403, "Forbidden")), "Forbidden");
  assert.equal(getErrorMessage({ status: 401 }), "Please sign in to continue.");
  assert.equal(getErrorMessage({ status: 403 }), "You do not have permission to perform this action.");
  assert.equal(getErrorMessage({ status: 409 }), "Another update was made at the same time. Please refresh and try again.");
});

test("toList returns arrays tolerantly from various object shapes", () => {
  assert.deepEqual(toList([1, 2, 3]), [1, 2, 3]);
  assert.deepEqual(toList({ items: ["a", "b"] }), ["a", "b"]);
  assert.deepEqual(toList({ results: [10, 20] }), [10, 20]);
  assert.deepEqual(toList({ data: ["x", "y"] }), ["x", "y"]);
  assert.deepEqual(toList({ logs: ["entry"] }), ["entry"]);
  assert.deepEqual(toList(null), []);
  assert.deepEqual(toList(undefined), []);
  assert.deepEqual(toList("not-an-object"), []);
});

test("formatting helpers produce clean human strings", () => {
  assert.equal(formatPlural(1, "report", "reports"), "1 report");
  assert.equal(formatPlural(9, "report", "reports"), "9 reports");
  assert.equal(formatDuration(48), "2 days");
  assert.equal(formatDuration(53.5), "2 days 6 hours");
  assert.equal(formatDuration(3), "3 hours");

  const d = new Date("2026-07-20T12:46:00Z");
  assert.match(formatDate(d), /20 Jul 2026/);
  assert.match(formatDateTime(d), /20 Jul 2026/);
});
