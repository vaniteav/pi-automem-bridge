/**
 * mcp-client.ts - JSON-RPC client for AutoMem MCP sidecar.
 *
 * Reads connection info from pi's mcp.json. Supports two transports:
 *   - HTTP  — server entry has a `url` field (Railway, Docker HTTP mode)
 *   - Stdio — server entry has a `command` field (local subprocess, wizard installs)
 */

import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";
import { loadConfig, resolveEnvVars, type AutoMemConfig } from "./config";
import { HttpTransport, StdioTransport, type Transport } from "./transport";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpCallResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export interface McpHealth {
  healthy: boolean;
  memoryCount?: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// MCP config reader
// ---------------------------------------------------------------------------

interface ServerEntry {
  url?: string;
  auth?: string;
  command?: string;
  args?: string[];
  spawnEnv?: Record<string, string>;
}

// ponytail: signature map only — invalidates transport+discovery on mcp.json changes (tested by C1, C5, C6)
let mcpSignatures: Map<string, string> = new Map();
let transportCache: Map<string, Transport> = new Map();

function readMcpServerEntry(serverName: string): ServerEntry {
  const mcpJsonPath = resolve(homedir(), ".pi", "agent", "mcp.json");

  if (!existsSync(mcpJsonPath)) {
    throw new Error("mcp.json not found at " + mcpJsonPath);
  }

  try {
    const st = statSync(mcpJsonPath);
    const sig = st.mtimeMs + ":" + st.size;
    if (mcpSignatures.get(serverName) !== sig) {
      mcpSignatures.set(serverName, sig);
      discoveredToolsPrefix = null;
      const old = transportCache.get(serverName);
      if (old) {
        old.shutdown().catch(function() {});
        transportCache.delete(serverName);
      }
    }
  } catch (_e) { /* leave stale signature; retry next call */ }

  const mcpJson = JSON.parse(readFileSync(mcpJsonPath, "utf8")) as {
    mcpServers?: Record<string, {
      url?: string;
      headers?: Record<string, string>;
      command?: string;
      args?: string[];
      env?: Record<string, string>;
    }>;
  };

  const server = mcpJson.mcpServers ? mcpJson.mcpServers[serverName] : undefined;
  if (!server) {
    const available = mcpJson.mcpServers ? Object.keys(mcpJson.mcpServers).join(", ") : "(none)";
    throw new Error('MCP server "' + serverName + '" not found. Available: ' + available);
  }

  if (server.url) {
    const rawUrl = server.url;
    try {
      new URL(rawUrl);
    } catch (_e) {
      throw new Error(
        '[automem] URL "' + rawUrl + '" in mcp.json is not a valid URL. ' +
        'Expected format: https://your-mcp-server.example.com/mcp'
      );
    }
    if (!rawUrl.includes("/mcp")) {
      console.warn(
        '[automem] URL does not contain "/mcp": ' + rawUrl +
        ' — most AutoMem deployments require the /mcp path suffix.'
      );
    }
    const rawAuth = server.headers?.Authorization || "";
    const varMatch = rawAuth.match(/\$\{([^}]+)\}/);
    if (varMatch && !process.env[varMatch[1]]) {
      console.warn(
        '[automem] Auth env var "' + varMatch[1] + '" is not set — AutoMem calls will be unauthorized. ' +
        'Windows: run  setx ' + varMatch[1] + ' "your-token"  then open a new terminal. ' +
        'Unix: add  export ' + varMatch[1] + '=your-token  to your shell profile.'
      );
    }
    return { url: rawUrl, auth: resolveEnvVars(rawAuth) };

  } else if (server.command) {
    const spawnEnv: Record<string, string> = {};
    if (server.env) {
      for (const [k, v] of Object.entries(server.env)) {
        spawnEnv[k] = resolveEnvVars(v);
      }
    }
    return { command: server.command, args: server.args || [], spawnEnv };

  } else {
    throw new Error(
      '[automem] Server "' + serverName + '" in mcp.json must have either ' +
      '"url" (HTTP transport) or "command" (stdio transport).\n' +
      '  HTTP:  "url": "https://your-service.up.railway.app/mcp"\n' +
      '  Stdio: "command": "mcp-automem", "args": ["server"]'
    );
  }
}

// ---------------------------------------------------------------------------
// Transport management
// ---------------------------------------------------------------------------

async function getOrCreateTransport(serverName: string, entry: ServerEntry): Promise<Transport> {
  const existing = transportCache.get(serverName);
  if (existing && existing.isHealthy()) return existing;

  let transport: Transport;

  if (entry.url) {
    transport = new HttpTransport(entry.url, entry.auth || "");
  } else if (entry.command) {
    const stdio = new StdioTransport(entry.command, entry.args, entry.spawnEnv);
    await stdio.initialize();
    transport = stdio;
  } else {
    throw new Error("[automem] No transport configured for server " + serverName);
  }

  transportCache.set(serverName, transport);
  return transport;
}

export async function shutdownAllTransports(): Promise<void> {
  for (const [, transport] of transportCache) {
    await transport.shutdown().catch(function() {});
  }
  transportCache.clear();
}

// ---------------------------------------------------------------------------
// Server name + config helper
// ---------------------------------------------------------------------------

let configuredServerName = process.env.AUTOMEM_MCP_SERVER || "automem";

export function setAutoMemMcpServerName(serverName: string | undefined): void {
  if (serverName && serverName.trim()) {
    const newName = serverName.trim();
    if (newName !== configuredServerName) {
      discoveredToolsPrefix = null;
      mcpSignatures = new Map();
      const old = transportCache.get(configuredServerName);
      if (old) old.shutdown().catch(function() {});
      transportCache.clear();
      configuredServerName = newName;
    }
  }
}

function getAutoMemMcpServerName(): string {
  return process.env.AUTOMEM_MCP_SERVER || configuredServerName || "automem";
}

export function loadConfigAndActivate(): AutoMemConfig {
  const config = loadConfig();
  setAutoMemMcpServerName(config.mcpServerName);
  return config;
}

// ---------------------------------------------------------------------------
// Core JSON-RPC call
// ---------------------------------------------------------------------------

async function mcpCall(
  tool: string,
  args: Record<string, unknown>,
  timeoutMs: number = 30000,
): Promise<McpCallResult> {
  const serverName = getAutoMemMcpServerName();
  const entry = readMcpServerEntry(serverName);
  const transport = await getOrCreateTransport(serverName, entry);

  const payload = (await transport.rpc("tools/call", { name: tool, arguments: args }, timeoutMs)) as {
    result?: McpCallResult;
    error?: { code: number; message: string };
  };

  if (payload.error) {
    throw new Error("MCP error: " + payload.error.message);
  }

  const result = payload.result || { content: [] };
  if (result.isError) {
    const errText = result.content && result.content[0] ? result.content[0].text : undefined;
    throw new Error("MCP tool error: " + (errText || "tool reported isError"));
  }
  return result;
}

// ---------------------------------------------------------------------------
// Tool discovery
// ---------------------------------------------------------------------------

let discoveredToolsPrefix: boolean | null = null;

export async function discoverTools(): Promise<void> {
  const serverName = getAutoMemMcpServerName();
  const entry = readMcpServerEntry(serverName);

  if (discoveredToolsPrefix !== null) return;

  try {
    const transport = await getOrCreateTransport(serverName, entry);
    const payload = (await transport.rpc("tools/list", {}, 15000)) as {
      result?: { tools?: Array<{ name: string }> };
      error?: { code: number; message: string };
    };

    if (payload.error) {
      throw new Error("MCP tools/list error: " + payload.error.message);
    }

    const tools = payload.result?.tools || [];
    discoveredToolsPrefix = tools.some(function(t) { return t.name.toLowerCase().startsWith("automem_"); });
    console.log("[automem] discovered tools: " + tools.map(function(t) { return t.name; }).join(", "));
  } catch (err) {
    console.warn("[automem] tools/list failed, using bare tool names: " + err);
    discoveredToolsPrefix = false;
  }
}

export function resolveToolName(logicalName: string): string {
  if (discoveredToolsPrefix === true) return "automem_" + logicalName;
  return logicalName;
}

// ---------------------------------------------------------------------------
// AutoMem-specific wrappers
// ---------------------------------------------------------------------------

export async function automemRecall(
  query: string,
  options?: {
    limit?: number;
    tags?: string[];
    tagMode?: "any" | "all";
    contextTypes?: string[];
    expandRelations?: boolean;
    expandEntities?: boolean;
  },
  timeoutMs?: number,
): Promise<McpCallResult> {
  const args: Record<string, unknown> = {
    query,
    format: "json",
    limit: options && options.limit ? options.limit : 8,
    tags: options && options.tags ? options.tags : [],
    tag_mode: options && options.tagMode ? options.tagMode : "any",
    expand_relations: options ? !!options.expandRelations : false,
    expand_entities: options ? !!options.expandEntities : false,
  };

  if (options && options.contextTypes && options.contextTypes.length > 0) {
    args.context_types = options.contextTypes;
  }

  return mcpCall(resolveToolName("recall_memory"), args, timeoutMs);
}

export async function automemHealth(timeoutMs: number = 30000): Promise<McpHealth> {
  try {
    const result = await mcpCall(resolveToolName("check_database_health"), {}, timeoutMs);
    const text = result.content && result.content[0] ? result.content[0].text : undefined;
    if (text) {
      try {
        const parsed = JSON.parse(text);
        const count = parsed.memory_count !== undefined
          ? parsed.memory_count
          : (parsed.count !== undefined ? parsed.count : parsed.memories);
        return {
          healthy: true,
          memoryCount: typeof count === "number" ? count : undefined,
        };
      } catch (_e) {
        return { healthy: true };
      }
    }
    return { healthy: true };
  } catch (err) {
    return { healthy: false, error: String(err) };
  }
}

export async function automemStore(
  content: string,
  type: string,
  tags: string[],
  options?: {
    source?: string;
    confidence?: number;
    importance?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<McpCallResult> {
  const meta: Record<string, unknown> = {};
  if (options && options.source) meta.source = options.source;
  if (options && options.metadata) Object.assign(meta, options.metadata);

  return mcpCall(resolveToolName("store_memory"), {
    content,
    type,
    tags,
    confidence: options?.confidence ?? 0.8,
    importance: options?.importance ?? 0.5,
    metadata: Object.keys(meta).length > 0 ? meta : undefined,
  });
}

export async function automemAssociate(
  memory1Id: string,
  memory2Id: string,
  relationship: string,
  strength: number = 0.5,
): Promise<McpCallResult> {
  return mcpCall(resolveToolName("associate_memories"), {
    memory1_id: memory1Id,
    memory2_id: memory2Id,
    type: relationship,
    strength,
  });
}

export async function automemUpdate(
  memoryId: string,
  updates: {
    content?: string;
    type?: string;
    tags?: string[];
    importance?: number;
    confidence?: number;
    metadata?: Record<string, unknown>;
  },
): Promise<McpCallResult> {
  const args: Record<string, unknown> = { memory_id: memoryId };
  if (updates.content !== undefined) args.content = updates.content;
  if (updates.type !== undefined) args.type = updates.type;
  if (updates.tags !== undefined) args.tags = updates.tags;
  if (updates.importance !== undefined) args.importance = updates.importance;
  if (updates.confidence !== undefined) args.confidence = updates.confidence;
  if (updates.metadata !== undefined) args.metadata = updates.metadata;
  return mcpCall(resolveToolName("update_memory"), args);
}

export async function automemDelete(memoryId: string): Promise<McpCallResult> {
  return mcpCall(resolveToolName("delete_memory"), {
    memory_id: memoryId,
  });
}
