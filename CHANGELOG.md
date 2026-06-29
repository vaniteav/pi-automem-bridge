# Changelog

## 0.4.0 — 2026-06-28

### Added
- **Stdio transport**: the bridge now supports local mcp-automem subprocess installs in addition to HTTP endpoints. If your mcp.json server entry has a `command` field (as created by the mcp-automem wizard for Claude Desktop, Cursor, etc.), the bridge spawns and manages the subprocess directly, completing the MCP initialization handshake before accepting tool calls. Transport is detected automatically — `url` → HTTP, `command` → stdio. No config changes needed for existing setups.
- `src/transport.ts`: `Transport` interface, `HttpTransport`, and `StdioTransport` — the HTTP call path is unchanged; stdio adds subprocess lifecycle management (SIGTERM → SIGKILL graceful shutdown) and newline-delimited JSON-RPC over stdin/stdout.
- `shutdownAllTransports()` called on `session_shutdown` to cleanly terminate any stdio subprocess at session end.
- `loadConfigAndActivate()` exported from `src/mcp-client`: loads `automem.json` and activates the configured server name in one call. Extension API users should prefer this over calling `loadConfig()` and `setAutoMemMcpServerName()` separately.

### Changed
- README: updated "Before you begin" and Step 3 to cover the stdio scenario; wizard installs now work as-is rather than requiring a separate HTTP service.

## 0.3.0 — 2026-06-28

### Fixed
- **Structured recall**: `recall_memory` calls now request `format: "json"` from the server, returning a structured JSON object instead of human-readable text. The `parseSearchResults` parser handles this object format (top-level `{ results: [...] }`) as the primary path. The text-format parser is retained as a fallback.
- **Actionable setup errors**: `mcp.json` URL validation now catches missing `https://` scheme and missing `/mcp` path suffix at config-load time with a plain-English error instead of an opaque `TypeError: Invalid URL` or `MCP HTTP 404` deep in the call stack.
- **Token env var warning**: if the auth header references an env var (e.g. `${AUTOMEM_TOKEN}`) that is not set, the bridge now warns at startup with exact `setx` / `export` instructions, catching the missing variable early so the auth issue surfaces immediately with instructions to fix it.
- **Lifecycle config no longer flagged**: the bridge connects to AutoMem via direct HTTP, independent of pi's MCP adapter lifecycle settings. The status command and session start no longer warn about `lifecycle: "lazy"`, and the `lifecycle: "keep-alive"` recommendation is removed from the README — it has no effect on bridge behavior.
- **`automem_update_memory` missing from SKILL.md**: the tool has existed since v0.2.5 but was absent from the skill listing. Added.

### Changed
- README "Before you begin" rewritten: clarifies that users need an AutoMem MCP **HTTP endpoint** (mcp-automem sidecar on Railway or Docker), not a local mcp-automem install. The stdio subprocess mode used by Claude Desktop/Cursor cannot be used by this bridge.
- README adds Railway-specific setup path: how to find the endpoint URL and auth token in the Railway dashboard.
- README adds Windows env var setup (`setx`, new-terminal requirement) and Unix equivalent.
- `examples/config.advanced.json`: `displayRecall` set to `"summary"` to match the actual default — `"hidden"` suppresses the recall notification entirely, which is not the right starting point for most users. Added missing `writePolicy.defaultSource`.
- `prompts/automem-guidelines.md`: `automem_update_memory` promoted from a passing mention to a first-class write behavior entry.
- `package.json`: removed `@verygoodplugins/mcp-automem` from `peerDependencies` — it is a deployed service, not a local package to install alongside the bridge.

## 0.2.5 — 2026-06-21

### Added
- `writePolicy.dedupeMinScore` (default `0.85`): duplicate detection now only fires when recall similarity clears this floor. Previously any nearest recall hit could flag a brand-new memory as a duplicate; recall results without a similarity score still surface as candidates (unchanged).

### Changed
- `loadConfig()` always returns a fresh deep clone of the defaults, so the shared `DEFAULT_CONFIG` singleton can no longer be aliased or mutated in place by validation clamps.

### Removed
- Dead config knobs with no consumers: `viewer` (`enabled`/`mode`/`port`), `behavior.injectSystemPrompt`, and `writePolicy.machineTag`. None were documented or wired to behavior; setting them never did anything.

## 0.2.4 — 2026-06-18

### Changed
- AutoMem connection warmup is now resilient to pi's lazy MCP startup: the bridge still tries to connect eagerly at session start, but if that first health check misses, later turns retry with a short timeout and run the missed startup recall after recovery.
- README setup now configures the AutoMem MCP server with `lifecycle: "keep-alive"`, and the bridge warns when the server is still using pi-mcp-adapter's default lazy lifecycle.

## 0.2.3 — 2026-06-18

### Changed
- Align write-tool failure behavior with pi SDK v0.79.7: policy blocks, missing approval in non-interactive contexts, and invalid update requests now throw from tool execution so pi marks them as failed tool calls.
- `automem_propose_memory` now reports policy-block recommendations as normal proposal data instead of marking the preview itself as a failed tool call.
- Duplicate detection and user-cancelled confirmations remain normal, non-error control-flow results.

## 0.2.2 — 2026-06-14

### Changed
- Documentation overhaul (no runtime changes) — version bumped so npm serves the rewritten README. Adds a benefit-framed hero and a "How it works" lifecycle section, reorders the front matter, and rewrites Setup as an explicit install → connect → reload → tune procedure that distinguishes what's automatic, required, and optional. Also documents that pi can write the `mcp.json` / `automem.json` config for you, makes every config option discoverable via the bundled examples, and sharpens attribution so AutoMem (storage + recall engine) and this package (automation + guardrails) are clearly distinguished.

## 0.2.1 — 2026-06-13

Patch release with reliability and performance refinements.

### Added
- `turnRecall.timeoutMs` (default `8000`) and `startupRecall.timeoutMs` (default `15000`) config options to bound recall latency. All recall calls (startup, turn, dedupe) now use these short timeouts so a slow sidecar can't stall on the full 30s MCP timeout.

### Changed
- `mcp.json` is cached (and refreshed when it changes on disk) instead of re-read on every call.

### Fixed
- MCP tool-level errors now surface accurately in health checks and writes.
- Recall tag filtering matches the casing used when writing tags.
- `automem_correct_memory` normalizes stored content like the other write tools.
- Recall results are kept within the configured byte budget (oversized single memories are trimmed), and the `truncated` flag reflects it.
- Explicit `0` importance/confidence values are now preserved on write instead of being replaced by defaults.
- Project detection checks all configured git remotes.
- Corrected the `npm test` script paths.

### Security
- Secret scanning now also covers memory `metadata`.
- Config merge ignores `__proto__`/`constructor`/`prototype` keys.

## 0.2.0 — 2026-06-06

### Added
- `automem_link_memories` — create a typed relationship between two existing memories by ID (`src/tools/relationship-tools.ts`)
- `automem_correct_memory` — store a corrected memory and link old → new with EVOLVED_INTO or CONTRADICTS relationship; preserves provenance history
- `projectOverrides` config section — per-project `limit`, `maxBytes`, `contextTypes`, `expandRelations`, `expandEntities` overrides applied during turn recall when a project tag is detected

## 0.1.0 — 2026-06-06 (pre-publish cleanup)

### Changed
- Default `writePolicy.mode` changed from `propose` to `safe-auto`. Low-risk categories (technical-decision, agent-pattern, bug-fix, tooling-lesson) now auto-write by default; all other writes still require approval.

### Removed
- `vault` config section removed from `AutoMemConfig` type, defaults, examples, and README. This section was specific to Obsidian-based setups and has no place in a general-purpose package.

## 0.1.0 — 2026-06-04

### Recall core
- Config loader with defaults and validation for `~/.pi/agent/automem.json`
- MCP JSON-RPC client reusing pi's existing `~/.pi/agent/mcp.json` connection
- Tool discovery with name normalization for `automem_` prefix
- Startup recall (queries + tags at session start)
- Turn-level recall (per-prompt, with project-scoped tags)
- Three display modes: `hidden`, `summary`, `full`
- Project detection from git remote, folder path, and prompt text
- `/automem-status` and `/automem-recall` commands
- Graceful degradation when AutoMem is unavailable

### Write tools
- `automem_propose_memory` — validates and previews candidates without writing
- `automem_commit_memory` — policy-gated store with secret scanning, dedupe check, and confirmation flow
- `automem_update_memory` — standalone tool to update any memory by ID
- `automemUpdate()` wrapper in mcp-client for `update_memory` MCP tool
- Write policy modes: `off`, `propose` (default), `safe-auto`, `confirm-all`
- Secret/credential scanning (API keys, bearer tokens, private keys, connection strings, etc.)
- Configurable auto-write, confirm, and blocked categories
- Minimum importance threshold for writes
- Dedupe recall with configurable limit and `dedupeQuery` override

### Update-vs-duplicate handling
- `automem_commit_memory` returns `DUPLICATE_DETECTED` when dedupe finds a matching memory
- `updateMemoryId` param on `automem_commit_memory` to update existing instead of storing duplicate
- `dedupeQuery: ""` to skip dedupe check for intentional first stores
- `automem_update_memory` standalone tool with optional confirmation gate
- Extended live write test covering: commit → dedupe → update paths → cleanup

### Fixed
- `Type.Intersect` on `automem_commit_memory` parameters produced `{ allOf: [...] }` with no `type: "object"` — broke OpenAI function-calling API. Replaced with flat `Type.Object`.
