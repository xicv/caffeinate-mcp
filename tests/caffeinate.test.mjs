import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execSync } from "node:child_process";

const tmpRoot = mkdtempSync(join(tmpdir(), "caffeinate-int-test-"));
process.env.XDG_CACHE_HOME = tmpRoot;

const { startCaffeinate, stopCaffeinate, getStatus } = await import("../dist/caffeinate.js");
const { test, after, beforeEach } = await import("node:test");
const { default: assert } = await import("node:assert/strict");

after(() => {
  stopCaffeinate();
  rmSync(tmpRoot, { recursive: true, force: true });
});

beforeEach(() => stopCaffeinate());

function pidRunning(pid) {
  try {
    execSync(`ps -p ${pid} -o pid=`, { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

test("startCaffeinate: duration mode spawns process with -t", async () => {
  const { state, args } = startCaffeinate({
    durationSeconds: 30,
    flags: "-di",
    claudePid: null,
  });
  assert.equal(state.mode, "duration");
  assert.equal(state.expires_at, state.started_at + 30);
  assert.equal(state.flags, "-di");
  assert.ok(state.pid > 0);
  assert.deepEqual(args, ["-di", "-t", "30"]);
  assert.equal(pidRunning(state.pid), true);
  stopCaffeinate();
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(pidRunning(state.pid), false);
});

test("startCaffeinate: session mode uses -w when claude pid alive", () => {
  const { state, args } = startCaffeinate({
    untilSessionEnd: true,
    flags: "-di",
    claudePid: process.pid,
  });
  assert.equal(state.mode, "session");
  assert.equal(state.expires_at, null);
  assert.equal(state.claude_pid, process.pid);
  assert.deepEqual(args, ["-di", "-w", String(process.pid)]);
  stopCaffeinate();
});

test("startCaffeinate: session falls back to infinite when claude pid dead", () => {
  const { state } = startCaffeinate({
    untilSessionEnd: true,
    flags: "-di",
    claudePid: 999999,
  });
  assert.equal(state.mode, "infinite");
  stopCaffeinate();
});

test("startCaffeinate: replaces existing session", () => {
  const { state: a } = startCaffeinate({ durationSeconds: 60, flags: "-di", claudePid: null });
  const { state: b } = startCaffeinate({ durationSeconds: 30, flags: "-i", claudePid: null });
  assert.notEqual(a.pid, b.pid);
  assert.equal(getStatus().pid, b.pid);
  stopCaffeinate();
});

test("stopCaffeinate: returns stopped=false when no state", () => {
  const r = stopCaffeinate();
  assert.equal(r.stopped, false);
});

test("stopCaffeinate: kills running process", async () => {
  const { state } = startCaffeinate({ durationSeconds: 60, flags: "-di", claudePid: null });
  const r = stopCaffeinate();
  assert.equal(r.stopped, true);
  assert.equal(r.pid, state.pid);
  await new Promise((res) => setTimeout(res, 100));
  assert.equal(pidRunning(state.pid), false);
});

test("getStatus: null when nothing active", () => {
  assert.equal(getStatus(), null);
});

test("getStatus: returns state while active", () => {
  const { state } = startCaffeinate({ durationSeconds: 60, flags: "-di", claudePid: null });
  const s = getStatus();
  assert.equal(s.pid, state.pid);
  assert.equal(s.mode, "duration");
  stopCaffeinate();
});

test("getStatus: clears state when pid is dead", async () => {
  const { state } = startCaffeinate({ durationSeconds: 60, flags: "-di", claudePid: null });
  process.kill(state.pid, "SIGKILL");
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(getStatus(), null);
});
