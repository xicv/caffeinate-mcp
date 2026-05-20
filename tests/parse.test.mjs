import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeFlags, formatDuration, renderBar } from "../dist/parse.js";

test("normalizeFlags: returns fallback on undefined/empty", () => {
  assert.equal(normalizeFlags(undefined), "-di");
  assert.equal(normalizeFlags(""), "-di");
  assert.equal(normalizeFlags(undefined, "-i"), "-i");
});

test("normalizeFlags: strips leading dash", () => {
  assert.equal(normalizeFlags("-di"), "-di");
  assert.equal(normalizeFlags("di"), "-di");
});

test("normalizeFlags: deduplicates", () => {
  assert.equal(normalizeFlags("-ddii"), "-di");
});

test("normalizeFlags: drops unknown chars", () => {
  assert.equal(normalizeFlags("-dixyz"), "-di");
  assert.equal(normalizeFlags("xyz"), "-di");
});

test("normalizeFlags: accepts all valid chars", () => {
  const result = normalizeFlags("-dimsu");
  assert.equal(result.length, 6);
  for (const c of "dimsu") assert.ok(result.includes(c));
});

test("formatDuration: zero and negative", () => {
  assert.equal(formatDuration(0), "0s");
  assert.equal(formatDuration(-10), "0s");
});

test("formatDuration: seconds", () => {
  assert.equal(formatDuration(5), "5s");
  assert.equal(formatDuration(45), "45s");
});

test("formatDuration: minutes", () => {
  assert.equal(formatDuration(60), "1m");
  assert.equal(formatDuration(90), "1m 30s");
  assert.equal(formatDuration(120), "2m");
});

test("formatDuration: hours suppress seconds", () => {
  assert.equal(formatDuration(3600), "1h");
  assert.equal(formatDuration(3661), "1h 1m");
  assert.equal(formatDuration(28800), "8h");
});

test("formatDuration: big values", () => {
  assert.equal(formatDuration(86400), "24h");
});

test("renderBar: 0% all empty", () => {
  assert.equal(renderBar(0, 10), "░".repeat(10));
});

test("renderBar: 100% all filled", () => {
  assert.equal(renderBar(1, 10), "█".repeat(10));
});

test("renderBar: 50%", () => {
  assert.equal(renderBar(0.5, 10), "█".repeat(5) + "░".repeat(5));
});

test("renderBar: clamps out-of-range", () => {
  assert.equal(renderBar(-0.5, 10), "░".repeat(10));
  assert.equal(renderBar(2, 10), "█".repeat(10));
});

test("renderBar: custom width", () => {
  assert.equal(renderBar(0.5, 4), "██░░");
});
