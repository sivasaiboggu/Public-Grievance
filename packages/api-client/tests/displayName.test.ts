import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { displayName, getTimeOfDayGreeting } from "../src/index.ts";

describe("displayName helper", () => {
  it("drops honorifics and skips initials", () => {
    assert.equal(displayName("S. Ramanathan"), "Ramanathan");
    assert.equal(displayName("Priya Patel"), "Priya");
    assert.equal(displayName("Dr. Anita Roy"), "Anita");
    assert.equal(displayName("Shri Rajesh Kumar"), "Rajesh");
    assert.equal(displayName("Mrs. S. Meena"), "Meena");
    assert.equal(displayName("A. B. Dev"), "Dev");
  });

  it("handles fallback and edge cases", () => {
    assert.equal(displayName(""), "");
    assert.equal(displayName(null), "");
    assert.equal(displayName(undefined), "");
    assert.equal(displayName("S."), "S.");
    assert.equal(displayName("sivasai"), "Sivasai");
    assert.equal(displayName("sivasai kumar"), "Sivasai");
  });
});

describe("getTimeOfDayGreeting helper", () => {
  it("returns appropriate time-of-day greetings", () => {
    // 8:00 AM -> Good morning
    const morning = new Date(2026, 9, 18, 8, 30);
    assert.equal(getTimeOfDayGreeting(morning), "Good morning");

    // 14:00 (2:00 PM) -> Good afternoon
    const afternoon = new Date(2026, 9, 18, 14, 15);
    assert.equal(getTimeOfDayGreeting(afternoon), "Good afternoon");

    // 19:00 (7:00 PM) -> Good evening
    const evening = new Date(2026, 9, 18, 19, 0);
    assert.equal(getTimeOfDayGreeting(evening), "Good evening");

    // 3:00 AM -> Hello
    const night = new Date(2026, 9, 18, 3, 30);
    assert.equal(getTimeOfDayGreeting(night), "Hello");
  });
});
