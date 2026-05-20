import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// MUST set XDG_CACHE_HOME before importing state.js (module captures it at load time).
const tmpRoot = mkdtempSync(join(tmpdir(), "caffeinate-state-test-"));
process.env.XDG_CACHE_HOME = tmpRoot;

const { nowSec, readState, writeState, clearState, isPidAlive, STATE_FILE, STATE_DIR } = await import("../dist/state.js");

const { test, after, beforeEach } = await import("node:test");
const { default: assert } = await import("node:assert/strict");

after(() => {
  rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => clearState());

test("nowSec: returns integer seconds close to wall clock", () => {
  const t = nowSec();
  assert.equal(Number.isInteger(t), true);
  const drift = Math.abs(t * 1000 - Date.now());
  assert.ok(drift < 2000, `drift ${drift}ms too large`);
});

test("readState: returns null when file missing", () => {
  assert.equal(readState(), null);
});

test("writeState + readState round-trip", () => {
  const s = {
    pid: 12345,
    started_at: 100,
    expires_at: 200,
    flags: "-di",
    mode: "duration",
    claude_pid: 999,
  };
  writeState(s);
  assert.deepEqual(readState(), s);
});

test("writeState: produces parseable JSON", () => {
  writeState({ pid: 1, started_at: 0, expires_at: null, flags: "-i", mode: "session", claude_pid: 2 });
  const raw = readFileSync(STATE_FILE, "utf8");
  assert.equal(JSON.parse(raw).pid, 1);
});

test("writeState: atomic — no leftover .tmp file", () => {
  writeState({ pid: 1, started_at: 0, expires_at: null, flags: "-i", mode: "infinite", claude_pid: null });
  const leftovers = readdirSync(STATE_DIR).filter((f) => f.endsWith(".tmp"));
  assert.deepEqual(leftovers, []);
});

test("clearState: removes file", () => {
  writeState({ pid: 1, started_at: 0, expires_at: 1, flags: "-d", mode: "duration", claude_pid: null });
  assert.equal(existsSync(STATE_FILE), true);
  clearState();
  assert.equal(existsSync(STATE_FILE), false);
});

test("clearState: idempotent when file missing", () => {
  clearState();
  clearState();
  assert.equal(existsSync(STATE_FILE), false);
});

test("isPidAlive: current process is alive", () => {
  assert.equal(isPidAlive(process.pid), true);
});

test("isPidAlive: unlikely PID returns false", () => {
  assert.equal(isPidAlive(999999), false);
});

test("readState: returns null on corrupt JSON", () => {
  mkdirSync(STATE_DIR, { recursive: true });
  writeFileSync(STATE_FILE, "{ not json", "utf8");
  assert.equal(readState(), null);
});
