---
name: caffeinate
description: Use when the user wants to keep their Mac from sleeping, prevent display/system sleep, stay caffeinated, disable sleep for a duration, release sleep when the Claude Code session ends, check whether the Mac is being kept awake, or stop keeping it awake. Triggers on phrases like "keep mac awake", "stay awake N hours", "don't sleep", "caffeinate", "let mac sleep", "is mac awake", "stop caffeinate", "wakeup N hours".
---

# Caffeinate

Map natural-language sleep-control requests to the `caffeinate-mcp` tools, which wrap macOS `caffeinate(8)`.

## Tools

- `caffeinate_start({ duration_seconds?, until_session_end?, flags? })` — start
- `caffeinate_stop({})` — stop
- `caffeinate_status({})` — query current state

## Quick reference

| User says | Call |
|---|---|
| "keep mac awake 8 hours" / "stay awake 8h" / "wakeup 8 hours" | `caffeinate_start({ duration_seconds: 28800 })` |
| "wake 4 hours" / "no sleep 4h" / "caffeinate 4 hrs" | `caffeinate_start({ duration_seconds: 14400 })` |
| "stay awake 30 min" | `caffeinate_start({ duration_seconds: 1800 })` |
| "don't sleep until this session ends" / "keep awake while we work" / "don't sleep" (no duration) | `caffeinate_start({ until_session_end: true })` |
| "system only, screen can sleep" + duration N | `caffeinate_start({ duration_seconds: N, flags: "-i" })` |
| "block everything, even disk" + duration N | `caffeinate_start({ duration_seconds: N, flags: "-dimsu" })` |
| "let mac sleep" / "stop caffeinate" / "release" | `caffeinate_stop({})` |
| "is mac awake" / "caffeinate status" / "how long until sleep" | `caffeinate_status({})` |

## Duration parsing

Convert human durations to seconds before calling:

- `Nh`, `N hours`, `N hrs` → `N * 3600`
- `Nm`, `N min`, `N minutes` → `N * 60`
- `Ns`, `N sec`, `N seconds` → `N`
- Combined ("1h 30m") → sum of parts
- No duration AND no explicit "until session" mention → default to `{ until_session_end: true }`

## Flags

| Want | flags |
|---|---|
| Default (display + system idle) | `-di` |
| System awake, screen can sleep | `-i` |
| Block everything (display, idle, disk, system, user-active) | `-dimsu` |
| Just user-active assertion (also wakes display) | `-u` |

Omit `flags` to use the `-di` default. The MCP filters unknown characters from the flags string.

## After every call

Briefly confirm what happened — one short sentence:

- start (duration) → "Mac will stay awake for 8h."
- start (session) → "Mac will stay awake until this session exits."
- stop → "Released — Mac will sleep per normal energy settings."
- status → relay mode, flags, remaining time on one line.

The claude-hud statusline already shows `☕ 7h 23m ████████░░ 80%` while active. Do NOT repeat the bar/percent in chat.

## Common mistakes

| Mistake | Fix |
|---|---|
| Calling `caffeinate_start` again while already active | Don't worry — tool stops the previous one first. Mention this in the confirmation. |
| Passing both `duration_seconds` AND `until_session_end: true` | Session-end wins. Pick one based on user intent. |
| Treating "forever" / "indefinitely" as session-end | They're different: session-end releases at Claude Code exit; "forever" leaves caffeinate running after the session. If user says "forever", warn that it outlives the session and confirm. |
| Inventing a duration when user is ambiguous ("keep awake") | Default to `{ until_session_end: true }`. Don't guess hours. |
| Calling `caffeinate_start` to "refresh" an active timer | Tool restarts from scratch. If user wants to extend, ask them by how much. |

## Red flags — STOP and re-read this skill

- About to pick a duration the user didn't state → use `until_session_end: true` instead
- About to render `☕` bar text in chat → statusline already does it; skip
- About to combine duration + session-end → choose one
