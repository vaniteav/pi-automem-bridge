/**
 * /automem-status - Show AutoMem health, memory count, and config summary.
 */

import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import { automemHealth, getAutoMemMcpLifecycle, setAutoMemMcpServerName } from "../mcp-client";
import { loadConfig } from "../config";

export function registerStatusCommand(pi: {
  registerCommand: (name: string, opts: {
    description: string;
    handler: (args: string, ctx: ExtensionCommandContext) => Promise<void>;
  }) => void;
}) {
  pi.registerCommand("automem-status", {
    description: "Show AutoMem health and memory count",
    handler: async function(_args: string, ctx: ExtensionCommandContext) {
      const config = loadConfig();
      setAutoMemMcpServerName(config.mcpServerName);

      ctx.ui.notify("Checking AutoMem...", "info");
      try {
        const lifecycle = getAutoMemMcpLifecycle();
        ctx.ui.notify("MCP lifecycle: " + lifecycle, lifecycle === "lazy" ? "warning" : "info");
        if (lifecycle === "lazy") {
          ctx.ui.notify('Set lifecycle to "keep-alive" in ~/.pi/agent/mcp.json so AutoMem connects at startup and reconnects automatically.', "warning");
        }
      } catch (err) {
        ctx.ui.notify("Could not inspect MCP lifecycle: " + err, "warning");
      }

      const health = await automemHealth();

      if (health.healthy) {
        const count = health.memoryCount != null ? " (" + health.memoryCount + " memories)" : "";
        ctx.ui.notify("AutoMem: healthy" + count, "success");
      } else {
        ctx.ui.notify("AutoMem: unhealthy - " + (health.error || "unknown error"), "error");
      }

      ctx.ui.notify(
        "Config: startup=" + (config.startupRecall.enabled ? "on" : "off") +
        " turn=" + (config.turnRecall.enabled ? "on" : "off") +
        " project=" + (config.projectDetection.enabled ? "on" : "off"),
        "info",
      );
    },
  });
}
