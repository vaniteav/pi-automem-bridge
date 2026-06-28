/**
 * index.ts - AutoMem Core Extension entry point.
 * - session_start: load config, health check, startup recall
 * - before_agent_start: turn-level recall, inject context
 * - /automem-status: health + memory count
 * - /automem-recall: manual recall
 * - status widget in footer
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { loadConfig } from "./config";
import { automemHealth, discoverTools, setAutoMemMcpServerName, shutdownAllTransports } from "./mcp-client";
import { startupRecall, turnRecall, type RecallResult } from "./recall";
import { detectProject } from "./project-detect";
import { buildContextMessage } from "./context-injector";
import { registerStatusCommand } from "./commands/status";
import { registerRecallCommand } from "./commands/recall";
import { registerMemoryTools } from "./tools/memory-tools";
import { registerRelationshipTools } from "./tools/relationship-tools";

export default function (pi: ExtensionAPI) {
  let config = loadConfig();
  setAutoMemMcpServerName(config.mcpServerName);
  let autoMemHealthy = false;
  let autoMemCount: number | undefined;
  let startupInjected = false;
  let startupRecallAttempted = false;
  let startupResult: RecallResult = { text: "", count: 0, truncated: false };

  // Register commands and write tools
  registerStatusCommand(pi);
  registerRecallCommand(pi);
  registerMemoryTools(pi);
  registerRelationshipTools(pi);

  // session_start - Load config, check health, run startup recall
  pi.on("session_start", async function(_event: any, ctx: any) {
    config = loadConfig();
    setAutoMemMcpServerName(config.mcpServerName);

    await refreshAutoMemHealth(ctx, false);

    if (config.startupRecall.enabled && autoMemHealthy) {
      await runStartupRecall(ctx);
    }

    updateStatusWidget(ctx);
  });

  // before_agent_start - Turn-level recall + context injection
  pi.on("before_agent_start", async function(event: any, ctx: any) {
    if (!autoMemHealthy) {
      const recovered = await refreshAutoMemHealth(ctx, true);
      if (!recovered) {
        updateStatusWidget(ctx);
        return;
      }
    }

    if (config.startupRecall.enabled && !startupRecallAttempted) {
      await runStartupRecall(ctx);
    }

    const prompt = event.prompt || "";
    if (!prompt.trim()) return;

    const project = detectProject(ctx.cwd, prompt, config);

    let turnResult;
    try {
      turnResult = await turnRecall(prompt, project, config);
    } catch (err) {
      console.warn("[automem] turn recall failed: " + err);
      return;
    }

    const startupForInjection = startupInjected
      ? { text: "", count: 0, truncated: false }
      : startupResult;

    if (turnResult.count === 0 && !startupForInjection.text) return;

    const injection = buildContextMessage(
      startupForInjection,
      { text: turnResult.text, count: turnResult.count, truncated: turnResult.truncated },
      project,
    );

    if (!injection) return;

    if (startupForInjection.text) startupInjected = true;

    const displayRecall = config.behavior.displayRecall || "summary";
    const displayFull = displayRecall === "full";

    if (displayRecall === "summary") {
      const parts: string[] = [];
      if (startupForInjection.count > 0) parts.push("startup " + startupForInjection.count);
      if (turnResult.count > 0) parts.push("turn " + turnResult.count);
      const projectPart = project.projectLabel ? " [" + project.projectLabel + "]" : "";
      ctx.ui.notify("AutoMem recalled" + projectPart + ": " + parts.join(", "), "info");
    }

    if (displayFull) {
      return {
        message: {
          customType: "automem-recall",
          content: injection.message,
          display: true,
        },
      };
    }

    // Hidden/summary mode: inject into the per-turn system prompt instead of
    // returning a session message. `display: false` hides from the TUI, but API
    // transcripts can still expose message injections as large context blocks.
    return {
      systemPrompt: (event.systemPrompt || "") + "\n\n" + injection.message,
    };
  });

  // session_shutdown - Cleanup
  pi.on("session_shutdown", async function(_event: any, _ctx: any) {
    await shutdownAllTransports();
    autoMemHealthy = false;
    autoMemCount = undefined;
    startupInjected = false;
    startupRecallAttempted = false;
    startupResult = { text: "", count: 0, truncated: false };
  });

  async function refreshAutoMemHealth(ctx: any, recoveringFromOffline: boolean): Promise<boolean> {
    try {
      if (!recoveringFromOffline) {
        await discoverTools();
      }

      const healthTimeout = recoveringFromOffline
        ? Math.max(1000, Math.min(3000, Number(config.turnRecall.timeoutMs || 3000)))
        : 30000;
      const health = await automemHealth(healthTimeout);
      autoMemHealthy = health.healthy;
      autoMemCount = health.memoryCount;

      if (health.healthy) {
        const count = health.memoryCount != null ? " (" + health.memoryCount + ")" : "";
        ctx.ui.notify(recoveringFromOffline ? "AutoMem: recovered" + count : "AutoMem: healthy" + count, "info");
      } else if (!recoveringFromOffline) {
        ctx.ui.notify("AutoMem: unhealthy - " + (health.error || "unreachable"), "warning");
      }

      return health.healthy;
    } catch (err) {
      autoMemHealthy = false;
      if (!recoveringFromOffline) {
        ctx.ui.notify("AutoMem health check failed: " + err, "warning");
      } else {
        console.warn("[automem] AutoMem still unavailable during turn health retry: " + err);
      }
      return false;
    }
  }

  async function runStartupRecall(ctx: any): Promise<void> {
    startupRecallAttempted = true;
    try {
      startupResult = await startupRecall(config);
      startupRecallAttempted = startupResult.failed !== true;
      if (startupResult.count > 0 && config.startupRecall.showStatus) {
        ctx.ui.notify("AutoMem: recalled " + startupResult.count + " memories at startup", "info");
      }
    } catch (err) {
      startupRecallAttempted = false;
      ctx.ui.notify("AutoMem startup recall failed: " + err, "warning");
    }
  }

  function updateStatusWidget(ctx: any) {
    const theme = ctx.ui.theme;
    if (autoMemHealthy) {
      const count = autoMemCount != null ? " (" + autoMemCount + ")" : "";
      ctx.ui.setStatus(
        "automem",
        theme.fg("success", "\u25CF") + theme.fg("dim", " AutoMem" + count),
      );
    } else {
      ctx.ui.setStatus(
        "automem",
        theme.fg("error", "\u25CF") + theme.fg("dim", " AutoMem (offline)"),
      );
    }
  }
}
