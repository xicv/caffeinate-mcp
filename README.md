# @xicv/caffeinate-mcp

[![npm version](https://img.shields.io/npm/v/@xicv/caffeinate-mcp.svg)](https://www.npmjs.com/package/@xicv/caffeinate-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![macOS](https://img.shields.io/badge/platform-macOS-blue.svg)](https://www.apple.com/macos/)

> Control your Mac's sleep behavior from Claude Code, with a live indicator in the [claude-hud](https://github.com/jarrodwatts/claude-hud) statusline.

Three pieces:

1. **MCP server** (`caffeinate-mcp`) — exposes `caffeinate_start`, `caffeinate_stop`, `caffeinate_status` tools that wrap macOS `caffeinate(8)`.
2. **Skill** (`skill/SKILL.md`) — teaches Claude to map natural-language requests ("keep mac awake 8 hours", "don't sleep until session ends") to those tools.
3. **Statusline wrapper** (`caffeinate-statusline`) — transparently runs `claude-hud` and appends a `☕ 7h 23m ████████░░ 80%` segment.

```
[Opus 4.7]
Context ██░░░░░░░░ 12% │ ☕ 7h 23m ████████░░ 80%
                                ^^^^^^^^^^^^^^^^^^^^^
                                added by caffeinate-mcp
```

## Requirements

- macOS (uses `/usr/bin/caffeinate`)
- Node ≥ 20
- Optional: [claude-hud](https://github.com/jarrodwatts/claude-hud) installed as a Claude Code plugin — the statusline wrapper auto-detects it. **If claude-hud is missing, the wrapper renders a minimal fallback line** (`[model] ~/path ctx N%`) so you still get a useful statusline.
- Optional: [bun](https://bun.sh) — required only if claude-hud is run from TypeScript source (its default install)

## Install

### From npm (recommended)

```bash
claude mcp add caffeinate --scope user -- npx -y @xicv/caffeinate-mcp
```

Then symlink the skill:

```bash
mkdir -p ~/.claude/skills
ln -s "$(npm root -g)/@xicv/caffeinate-mcp/skill" ~/.claude/skills/caffeinate
```

For the statusline, point `~/.claude/settings.json` `statusLine.command` at:

```bash
npx -y -p @xicv/caffeinate-mcp caffeinate-statusline
```

### From source

```bash
git clone https://github.com/xicv/caffeinate-mcp.git
cd caffeinate-mcp
pnpm install
pnpm build
pnpm test    # 42 tests, ~600ms
```

## Wire up the MCP server (from-source path)

Use the `claude` CLI (writes to `~/.claude/.claude.json` — the right place):

```bash
claude mcp add caffeinate --scope user -- node $(pwd)/dist/index.js
```

Verify:

```bash
claude mcp list | grep caffeinate
# caffeinate: node /Users/YOU/Projects/caffeinate-mcp/dist/index.js - ✓ Connected
```

> ⚠️ Do **not** put the entry in `~/.claude/settings.json` `mcpServers` — that key is ignored by current Claude Code versions. The CLI is the supported path.

Restart Claude Code. Run `/mcp` in a session — `caffeinate` should show three tools.

## Wire up the skill

```bash
mkdir -p ~/.claude/skills/caffeinate
cp skill/SKILL.md ~/.claude/skills/caffeinate/SKILL.md
```

(Or symlink: `ln -s "$PWD/skill" ~/.claude/skills/caffeinate`.)

Restart Claude Code. Try: **"keep my mac awake 2 hours"**.

## Wire up the statusline

Edit `~/.claude/settings.json` `statusLine.command` to point at the wrapper:

```json
{
  "statusLine": {
    "type": "command",
    "command": "node /Users/YOU/Projects/caffeinate-mcp/dist/statusline.js"
  }
}
```

The wrapper auto-discovers claude-hud via the standard plugin cache path. If your install is non-standard, override:

```bash
export CAFFEINATE_HUD_CMD="bun --env-file /dev/null /path/to/claude-hud/src/index.ts"
```

Other env knobs:

| Var | Default | Purpose |
|---|---|---|
| `CAFFEINATE_HUD_CMD` | (auto) | Full command to run instead of auto-detected claude-hud |
| `CAFFEINATE_HUD_DISABLE` | `0` | Set to `1` to skip claude-hud entirely and always render the minimal fallback |
| `CAFFEINATE_HUD_SEP` | `' │ '` | Separator between claude-hud output and the ☕ segment |
| `BUN_PATH` | `~/.bun/bin/bun` then `/opt/homebrew/bin/bun` then `/usr/local/bin/bun` | Bun binary path |
| `CLAUDE_CONFIG_DIR` | `~/.claude` | Used to locate the claude-hud plugin cache |
| `XDG_CACHE_HOME` | `~/.cache` | Where the state file lives |

### Statusline behavior matrix

| claude-hud installed? | `CAFFEINATE_HUD_DISABLE` | caffeinate active? | Output |
|---|---|---|---|
| yes | unset | yes | full HUD + `│ ☕ 7h 23m ████░░ 80%` |
| yes | unset | no | full HUD only |
| yes | `1` | yes | `[Opus 4.7] ~/path ctx 42% │ ☕ 7h 23m ████░░ 80%` |
| no  | any | yes | `[Opus 4.7] ~/path ctx 42% │ ☕ 7h 23m ████░░ 80%` |
| no  | any | no | `[Opus 4.7] ~/path ctx 42%` |

The fallback line is rendered from the JSON Claude Code already pipes to the statusline on stdin — same source claude-hud parses. Zero extra dependencies.

## Usage examples

In any Claude Code session:

> keep mac awake 8 hours

→ Mac stays awake for 8h. Statusline shows `☕ 7h 59m ░░░░░░░░░░ 0%`, ticking down.

> don't sleep until this session ends

→ caffeinate spawned with `-w $CLAUDE_PID`. Auto-released when Claude Code exits. Statusline shows `☕ until session end`.

> let mac sleep

→ Stops caffeinate. Segment disappears from statusline.

> is mac awake?

→ Returns mode, flags, remaining time.

## How the statusline indicator works

```
                    Claude Code
                         │
                ┌────────┴────────┐
                │  stdin (JSON)   │
                ▼                 │
     caffeinate-statusline        │
        │   │                     │
        │   └─pipe stdin──► claude-hud ──stdout──┐
        │                                        │
        │   reads ~/.cache/caffeinate-mcp/       │
        │         state.json                     │
        │                                        ▼
        └─► "<hud-out> │ ☕ 7h 23m ████░░ 80%" ─► stdout
```

- The wrapper invokes claude-hud as a subprocess on every statusline tick (~300ms), captures its stdout verbatim, then appends our segment.
- The MCP server writes a tiny JSON state file when caffeinate starts; the wrapper reads it. No IPC, no daemon — file is the source of truth.
- When caffeinate exits (timeout reached, parent died, manual stop), the wrapper notices the dead PID, removes the stale state, and stops rendering the segment.

## State file

`~/.cache/caffeinate-mcp/state.json`:

```json
{
  "pid": 12345,
  "started_at": 1779278627,
  "expires_at": 1779307427,
  "flags": "-di",
  "mode": "duration",
  "claude_pid": 12300
}
```

`mode` is one of `duration`, `session`, `infinite`. `expires_at` is `null` for non-duration modes.

## Modes

| Mode | When | Caffeinate args |
|---|---|---|
| `duration` | `duration_seconds` provided | `caffeinate <flags> -t <sec>` — kernel auto-releases at timeout |
| `session` | `until_session_end: true` | `caffeinate <flags> -w <claude-pid>` — kernel releases when Claude exits |
| `infinite` | neither | `caffeinate <flags>` — runs until `caffeinate_stop` |

## Caffeinate flags

| Flag | Effect |
|---|---|
| `-d` | Block display sleep |
| `-i` | Block system idle sleep |
| `-m` | Block disk idle sleep |
| `-s` | Block system sleep (AC only) |
| `-u` | Declare user active (turns display on, default 5s timeout) |

Default in this skill: `-di`.

## Troubleshooting

**Statusline shows nothing extra after starting caffeinate.**
Verify the state file exists: `cat ~/.cache/caffeinate-mcp/state.json`. If absent, the MCP server didn't get called — check `/mcp` connection.

**Statusline shows our segment but claude-hud output is missing.**
Auto-detection failed. Set `CAFFEINATE_HUD_CMD` explicitly to your previous `statusLine.command`.

**caffeinate process orphans after Claude Code exits.**
Only happens in `infinite` mode. Use `until_session_end: true` instead, or call `caffeinate_stop` explicitly.

**`spawnSync` for claude-hud times out.**
Hardcoded 5s ceiling — bump in `src/statusline.ts` if claude-hud is unusually slow on first run.

## Project layout

```
caffeinate-mcp/
├── src/
│   ├── index.ts        MCP server entry
│   ├── statusline.ts   claude-hud wrapper + ☕ segment
│   ├── caffeinate.ts   spawn/stop/status logic
│   ├── state.ts        state.json read/write + PID liveness
│   ├── parse.ts        flag normalize, duration format, bar render
│   └── types.ts        shared TS types
├── skill/SKILL.md      natural-language → tool mapping for Claude
├── package.json
├── tsconfig.json
└── README.md
```

## License

MIT
