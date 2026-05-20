#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { getStatus, startCaffeinate, stopCaffeinate } from "./caffeinate.js";
import { formatDuration, normalizeFlags } from "./parse.js";
import { nowSec } from "./state.js";

const server = new McpServer({
  name: "caffeinate-mcp",
  version: "0.1.0",
});

server.registerTool(
  "caffeinate_start",
  {
    title: "Keep Mac awake",
    description:
      "Prevent macOS from sleeping. Spawns the built-in `caffeinate` daemon. " +
      "Pass `duration_seconds` for a timed assertion, OR `until_session_end: true` to release " +
      "automatically when Claude Code exits. If both omitted, defaults to `until_session_end`.",
    inputSchema: {
      duration_seconds: z
        .number()
        .int()
        .positive()
        .optional()
        .describe("Seconds to keep awake. Omit if using until_session_end."),
      until_session_end: z
        .boolean()
        .optional()
        .describe("If true, caffeinate releases when Claude Code process exits."),
      flags: z
        .string()
        .optional()
        .describe(
          "caffeinate flags string, e.g. '-di' (display+idle), '-i' (idle only), '-dimsu' (all). Default '-di'.",
        ),
    },
  },
  async ({ duration_seconds, until_session_end, flags }) => {
    const normalized = normalizeFlags(flags, "-di");
    const ppid = process.ppid || null;
    const wantsSession =
      until_session_end === true || (until_session_end === undefined && duration_seconds === undefined);

    const { state, args } = startCaffeinate({
      durationSeconds: duration_seconds,
      untilSessionEnd: wantsSession,
      flags: normalized,
      claudePid: ppid,
    });

    const summary =
      state.mode === "session"
        ? `Caffeinate active until Claude Code exits (pid ${state.pid}, flags ${normalized})`
        : state.mode === "duration"
          ? `Caffeinate active for ${formatDuration(duration_seconds ?? 0)} (pid ${state.pid}, flags ${normalized})`
          : `Caffeinate active indefinitely (pid ${state.pid}, flags ${normalized}). Run caffeinate_stop to release.`;

    return {
      content: [
        {
          type: "text",
          text: `${summary}\nargs: caffeinate ${args.join(" ")}`,
        },
      ],
    };
  },
);

server.registerTool(
  "caffeinate_stop",
  {
    title: "Allow Mac to sleep",
    description: "Stop the active caffeinate assertion (allow Mac to sleep normally).",
    inputSchema: {},
  },
  async () => {
    const result = stopCaffeinate();
    return {
      content: [
        {
          type: "text",
          text: result.stopped
            ? `Stopped caffeinate (was pid ${result.pid}).`
            : "No active caffeinate session found.",
        },
      ],
    };
  },
);

server.registerTool(
  "caffeinate_status",
  {
    title: "Caffeinate status",
    description: "Report whether caffeinate is active, mode, flags, and time remaining.",
    inputSchema: {},
  },
  async () => {
    const state = getStatus();
    if (!state) {
      return {
        content: [{ type: "text", text: "inactive — Mac will sleep per normal energy settings." }],
      };
    }
    const now = nowSec();
    const elapsed = now - state.started_at;
    const remaining = state.expires_at !== null ? state.expires_at - now : null;
    const lines = [
      `active (pid ${state.pid}, mode ${state.mode}, flags ${state.flags})`,
      `elapsed: ${formatDuration(elapsed)}`,
      remaining !== null
        ? `remaining: ${formatDuration(remaining)} (expires at unix ${state.expires_at})`
        : state.mode === "session"
          ? `releases when Claude Code (pid ${state.claude_pid}) exits`
          : "no timeout (infinite)",
    ];
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[caffeinate-mcp] ready");
}

main().catch((err) => {
  console.error("[caffeinate-mcp] fatal:", err);
  process.exit(1);
});
