/**
 * transport.ts - MCP JSON-RPC transport layer.
 *
 * HttpTransport: sends JSON-RPC 2.0 requests over HTTP POST (with SSE fallback).
 * StdioTransport: spawns a subprocess and speaks JSON-RPC over stdin/stdout,
 *   completing the MCP initialization handshake before accepting tool calls.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { createInterface, type Interface } from "node:readline";

// ---------------------------------------------------------------------------
// Transport interface
// ---------------------------------------------------------------------------

export interface Transport {
  rpc(method: string, params: object, timeoutMs?: number): Promise<{ result?: any; error?: { code: number; message: string } }>;
  shutdown(): Promise<void>;
  isHealthy(): boolean;
}

// ---------------------------------------------------------------------------
// HTTP transport
// ---------------------------------------------------------------------------

export class HttpTransport implements Transport {
  private url: string;
  private auth: string;
  private allowAuth: boolean;
  private callId = 0;

  constructor(url: string, auth: string) {
    this.url = url;
    this.auth = auth;
    // Enforce, don't just warn: never transmit the Authorization token over a
    // plaintext connection to a non-loopback host. A misconfigured mcp.json
    // pointing at an http:// remote would otherwise leak the credential.
    this.allowAuth = isSecureAuthTarget(url);
    if (auth && !this.allowAuth) {
      console.warn(
        "[automem] Authorization token withheld: " + url + " is not https:// or a loopback host. " +
        "The request will be sent without credentials. Use https:// for remote AutoMem deployments."
      );
    }
  }

  async rpc(method: string, params: object, timeoutMs: number = 30000): Promise<any> {
    const body = {
      jsonrpc: "2.0",
      id: ++this.callId,
      method,
      params,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const resp = await fetch(this.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(this.auth && this.allowAuth ? { Authorization: this.auth } : {}),
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const text = await resp.text().catch(function() { return ""; });
        throw new Error("MCP HTTP " + resp.status + ": " + text.slice(0, 200));
      }

      return await parseJsonRpcResponse(resp);
    } finally {
      clearTimeout(timeout);
    }
  }

  async shutdown(): Promise<void> {}

  isHealthy(): boolean {
    return true;
  }
}

/** True if it is safe to send an Authorization header to this URL: https, or
 *  http to a loopback host. Anything else (or an unparseable URL) is unsafe. */
function isSecureAuthTarget(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol === "https:") return true;
  if (parsed.protocol !== "http:") return false;
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function parseJsonRpcResponse(resp: Response): Promise<any> {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("text/event-stream")) {
    const text = await resp.text();
    const dataLine = text
      .split("\n")
      .map(function(l: string) { return l.trim(); })
      .filter(function(l: string) { return l.startsWith("data:") && l.length > 5; })
      .pop();
    if (!dataLine) throw new Error("SSE response contained no data lines");
    return JSON.parse(dataLine.slice(5).trim());
  }
  return resp.json();
}

// ---------------------------------------------------------------------------
// Stdio transport
// ---------------------------------------------------------------------------

// Shell metacharacters that could break out of the command line under shell:true.
const SHELL_METACHARACTERS = /[&|;<>$`(){}\n\r"'^%!]/;

/** Reject a stdio command/args that contain shell metacharacters, which could be
 *  used for command injection when spawned through the Windows shell. */
function assertSafeSpawn(command: string, args: string[]): void {
  for (const part of [command, ...args]) {
    if (typeof part !== "string" || SHELL_METACHARACTERS.test(part)) {
      throw new Error(
        "[automem] Refusing to spawn the MCP stdio subprocess: the command or arguments " +
        "contain unsafe shell characters. Check the command/args in mcp.json."
      );
    }
  }
}

const MCP_PROTOCOL_VERSION = "2024-11-05";

export class StdioTransport implements Transport {
  private command: string;
  private args: string[];
  private spawnEnv: Record<string, string>;

  private proc: ChildProcess | null = null;
  private rl: Interface | null = null;
  private pending: Map<number, { resolve: Function; reject: Function; timer: ReturnType<typeof setTimeout> }> = new Map();
  private nextId = 1;
  private _healthy = false;

  constructor(command: string, args: string[] = [], spawnEnv: Record<string, string> = {}) {
    this.command = command;
    this.args = args;
    this.spawnEnv = spawnEnv;
  }

  async initialize(): Promise<void> {
    // On Windows we spawn through cmd.exe (shell: true) to resolve .cmd shims
    // (npx.cmd, node.cmd, etc.). That makes the command line subject to shell
    // interpretation, so a malicious or malformed mcp.json could inject extra
    // commands via metacharacters. Reject any unsafe characters before spawning.
    // Only relevant when shell is actually used (Windows); POSIX spawn passes
    // args directly to execvp with no shell, so metacharacters are inert there.
    if (process.platform === "win32") {
      assertSafeSpawn(this.command, this.args);
    }
    this.proc = spawn(this.command, this.args, {
      env: { ...process.env, ...this.spawnEnv },
      stdio: ["pipe", "pipe", "pipe"],
      // On Windows, cmd.exe is needed to resolve .cmd shims (npx.cmd, node.cmd, etc.)
      shell: process.platform === "win32",
    });

    this.proc.stderr?.on("data", function(chunk: Buffer) {
      process.stderr.write("[automem-stdio] " + chunk.toString());
    });

    this.proc.on("exit", (code: number | null) => {
      this._healthy = false;
      const reason = new Error("[automem] Stdio subprocess exited with code " + code);
      for (const [, p] of this.pending) {
        clearTimeout(p.timer);
        p.reject(reason);
      }
      this.pending.clear();
    });

    this.rl = createInterface({ input: this.proc.stdout! });
    this.rl.on("line", (line: string) => {
      if (!line.trim()) return;
      let msg: any;
      try { msg = JSON.parse(line); } catch (_e) { return; }

      const id: number | undefined = msg.id;
      if (id == null || !this.pending.has(id)) return;
      const { resolve, reject, timer } = this.pending.get(id)!;
      clearTimeout(timer);
      this.pending.delete(id);
      if (msg.error) {
        reject(new Error("MCP error " + msg.error.code + ": " + msg.error.message));
      } else {
        resolve(msg);
      }
    });

    // MCP initialization handshake per spec §2.1
    const initId = this.nextId++;
    const initResponse = await this.rawCall({
      jsonrpc: "2.0" as const,
      id: initId,
      method: "initialize",
      params: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: "pi-automem-bridge", version: "1.0" },
      },
    }, 10000);

    if (!initResponse.result) {
      throw new Error("[automem] Stdio initialize response missing result");
    }

    this.write({ jsonrpc: "2.0", method: "notifications/initialized" });
    this._healthy = true;
  }

  async rpc(method: string, params: object, timeoutMs: number = 30000): Promise<any> {
    if (!this._healthy) {
      throw new Error("[automem] Stdio transport is not ready — initialize() must complete first");
    }
    return this.rawCall({ jsonrpc: "2.0" as const, id: this.nextId++, method, params }, timeoutMs);
  }

  async shutdown(): Promise<void> {
    this._healthy = false;
    if (!this.proc || this.proc.killed) return;

    this.proc.kill("SIGTERM");

    await new Promise<void>((resolve) => {
      const force = setTimeout(() => {
        this.proc?.kill("SIGKILL");
        resolve();
      }, 5000);
      this.proc!.on("exit", function() {
        clearTimeout(force);
        resolve();
      });
    });

    this.rl?.close();
    this.proc = null;
    this.rl = null;
    this.pending.clear();
  }

  isHealthy(): boolean {
    return this._healthy && this.proc !== null && !this.proc.killed;
  }

  private write(msg: object): void {
    this.proc?.stdin?.write(JSON.stringify(msg) + "\n");
  }

  private rawCall(request: { jsonrpc: "2.0"; id: number; method: string; params?: object }, timeoutMs: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(request.id);
        reject(new Error("[automem] Stdio call timed out after " + timeoutMs + "ms (method: " + request.method + ")"));
      }, timeoutMs);
      this.pending.set(request.id, { resolve, reject, timer });
      this.write(request);
    });
  }
}
