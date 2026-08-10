# Changelog

## Unreleased

### Security
- **pi's vulnerable transitive dependencies cleared by the SDK bump.** `brace-expansion` 5.0.7 → 5.0.9 (GHSA-mh99-v99m-4gvg, GHSA-rgw5-rvv9-x895) and `undici` 8.5.0 → 8.9.0 (GHSA-8xcm-r25x-g524, GHSA-4cwx-7wf7-3272, GHSA-m8rv-5g2x-5cg5, GHSA-jr45-8vmc-qm54, GHSA-v3r7-h72x-cjcm), both reachable only through `@earendil-works/pi-coding-agent`. `npm audit` goes from 3 vulnerable packages (2 high, 1 moderate) covering seven advisories to **0 vulnerabilities**.

### Changed
- **pi SDK lockfile 0.82.1 → 0.84.1.** `pi-agent-core`, `pi-ai` and `pi-tui` move with it; `pi-client`, `pi-protocol`, `pi-telemetry` and `grok-mermaid` arrive as new 0.84.x transitives. `package.json` is untouched — see the decision below. The `typebox` this package imports is the top-level 1.3.8 and is unaffected; only pi's own nested copy moved (1.1.38 → 1.3.7).

### Verified
- Compatible with pi SDK 0.84.1. `npx tsc --noEmit --skipLibCheck` is clean and the full offline suite (32 checks across `unit`, `phase2-policy`, `review-fixes`) passes, with output byte-identical to the 0.82.1 run. Every step of the `sdk-check` workflow was replayed locally end to end.
- Neither 0.84 release announces a deprecation: the shipped changelog has no `Deprecated` heading and no occurrence of "deprecat" in either section. The only `@deprecated` marker in pi's extension-API typings is `usesCallbackServer` on OAuth auth methods (`dist/core/extensions/types.d.ts:1064`), which this package does not use. Nothing to migrate.

### Decision — adopt pi 0.84.1 in the lockfile, leave the peer range at `>=0.78.0`

**Context.** The lockfile pinned pi 0.82.1 while npm's `latest` had moved to 0.84.1. 0.82.1 pulls a `brace-expansion` and an `undici` carrying seven open advisories between them, all reachable only through pi. `package.json` declares pi as a peer dependency at `">=0.78.0"` with no upper bound, so the lockfile — not the manifest — is what decides which pi CI and contributors actually build against.

**Decision.** Bump the lockfile to 0.84.1 via `npm update @earendil-works/pi-coding-agent` and leave `package.json` completely unchanged, including the `">=0.78.0"` peer floor. No source changes; no override or resolution added for `brace-expansion`.

**Rationale.** Three parts.

*The bump is safe.* Every breaking change in 0.84.0 sits in a surface this package does not touch — pi-ai's model/provider registry (`ModelsStreamTransforms` → `ModelsRequestTransforms`, `ModelRegistry.getApiKeyAndHeaders`/`refresh`, `ModelRuntime.setRuntimeApiKey`, provider `context.stored`/`context.publish`), pi-agent-core's v4 lane-based session and harness APIs, the JSON/RPC `message_update` delta protocol, and experimental remote-session listings. Grepping `src/`, `tests/` and `scripts/` for all 27 identifiers those entries name returns zero hits. This package's entire pi surface is `pi.on` for three lifecycle events (`src/index.ts:35,48,120`), `pi.registerTool` (`src/tools/memory-tools.ts:48,72,171`; `src/tools/relationship-tools.ts:31,58`), `pi.registerCommand` (`src/commands/status.ts:14`; `src/commands/recall.ts:14`), and `ctx.ui.notify`/`setStatus`/`theme`/`confirm` — none of which 0.84 changes. 0.84.1 has no breaking changes at all.

*Not raising the floor is deliberate.* Nothing here now requires 0.84 — the package works unchanged on 0.78 through 0.84.1 — so a higher floor would buy no safety while breaking installs for anyone on an older pi. Version 1.0.1 exists precisely because a narrow peer range (`<0.81.0`) went stale and blocked pi 0.82.0's security fixes from reaching installs. Narrowing again would repeat that mistake to solve a problem that does not exist: because the range is open-ended, npm already resolves the newest pi on every fresh install.

*No local mitigation to retire.* This repo carries no `brace-expansion` workaround — no `overrides`, `resolutions`, `patchedDependencies`, `.npmrc` or patch directory, and no reference to the package anywhere outside `package-lock.json`. The advisory was only ever going to be fixed upstream, and now is: `npm ls brace-expansion` resolves 5.0.9 under `pi-coding-agent > minimatch`.

**Consequences.** `npm ci` — what both workflows run — now builds against 0.84.1 with a clean audit. Contributors on pi 0.78–0.83 are unaffected: the peer range still admits them and nothing in `src/` depends on 0.84 behavior. The open peer range keeps its known cost — a future breaking pi minor will resolve silently — which is exactly the risk the weekly `sdk-check` job exists to catch. This is a lockfile-only change; `files[]` is unaffected, so it ships no npm release on its own.

## 1.0.1 — 2026-08-02

### Fixed
- **The published package's pi peer range was stale by three minor versions.**
  `pi-automem-bridge@1.0.0` on npm declares
  `"@earendil-works/pi-coding-agent": ">=0.78.0 <0.81.0"`, while the repository has
  carried the corrected `">=0.78.0"` since `eb10638`. 1.0.0 was published
  2026-06-29 and the ceiling was never republished, so every install against pi
  0.81, 0.82 or 0.83 hits a peer conflict on the *published* metadata — including
  the current 0.83.0. This release exists solely to ship the range that the repo
  already had. Same class of ceiling that previously blocked pi 0.82.0's security
  fixes from reaching installs.

  Found by the weekly sweep routine's first run, which compares the **published
  artifact** against the repo rather than comparing a branch diff against `main`.

### Note on the preceding maintenance work
The 2026-08-02 maintenance commits themselves (`.github/workflows/`, `tests/`,
this file) touch nothing in `files[]` and genuinely needed no release. That
reasoning was correct and separately insufficient: it answered "did this branch
change the published payload?" when the question that mattered was "does the
published artifact still match the repo?" It did not.

### Verified
- Compatible with pi SDK 0.83.0. Its breaking change removed `Type.Base`, `Type.Awaited`, `Type.Promise`, `Type.AsyncIterator`, `Type.Iterator`, `Type.Options` and `Value.Mutate`; none are used here. Full and smoke suites pass against 0.83.0, so the declared `>=0.78.0` peer range remains accurate.

### Fixed
- Test env restore assigned `undefined` back to `process.env.AUTOMEM_CONFIG_PATH`, which coerces to the string `"undefined"` — truthy, so `resolveConfigPath()` resolved `./undefined` instead of the default path for every subsequent test in the file. Three sites now delete the key rather than reassigning, matching the pattern already used in `tests/phase1-smoke.ts`.

## 1.0.0 — 2026-06-28

First stable release. The package is feature-complete for its purpose — automatic recall and a guarded write pipeline for pi — and the public surface is now considered stable: the tool names/parameters, the `automem.json` config schema, and the documented Extension API exports. Breaking changes to those will bump the major version. Ongoing work is maintenance: tracking breaking changes in pi and AutoMem as they ship. (Functionally a superset of the 0.x line — same features, security-hardened and fully documented.)

### Added
- **Stdio transport**: the bridge now supports local mcp-automem subprocess installs in addition to HTTP endpoints. If your mcp.json server entry has a `command` field (as created by the mcp-automem wizard for Claude Desktop, Cursor, etc.), the bridge spawns and manages the subprocess directly, completing the MCP initialization handshake before accepting tool calls. Transport is detected automatically — `url` → HTTP, `command` → stdio. No config changes needed for existing setups.
- `src/transport.ts`: `Transport` interface, `HttpTransport`, and `StdioTransport` — the HTTP call path is unchanged; stdio adds subprocess lifecycle management (SIGTERM → SIGKILL graceful shutdown) and newline-delimited JSON-RPC over stdin/stdout.
- `shutdownAllTransports()` called on `session_shutdown` to cleanly terminate any stdio subprocess at session end.
- `loadConfigAndActivate()` exported from `src/mcp-client`: loads `automem.json` and activates the configured server name in one call. Extension API users should prefer this over calling `loadConfig()` and `setAutoMemMcpServerName()` separately.

### Security
- **`automem_update_memory` write-policy bypass closed**: the update tool previously passed every field straight to AutoMem with no policy or secret check. It now enforces `writePolicy.mode === "off"`, runs the secret/PII scan on `content` and `metadata`, rejects content over the configured hard length limit, and blocks any tag — or the category inferred from `type`/tags — that maps to `blockedCategories`. This matches the gate `automem_commit_memory` already gets from `evaluateWritePolicy`. (`importance` and `type` are intentionally not gated on updates, which legitimately leave them unchanged.)
- **Secret/PII detection hardened**: added a dedicated `AWS_SECRET_ACCESS_KEY` pattern (the prior `\bsecret\b` rule missed it — underscore is a word character) and generalized the compound-name assignment pattern. Added conservative PII patterns (US SSN, email address); a hit blocks the write like any other secret finding.
- **Secret values never echoed**: scanner findings are now fully redacted to `[redacted]`. Previously a 6-character prefix and 4-character suffix of the matched secret were retained and could surface in thrown error messages and tool `details`. Update-blocked errors now list only the finding *kind*, never the match.
- **Auth token withheld over plaintext**: the HTTP transport now refuses to send the `Authorization` header to any URL that is not `https://` or an `http://` loopback host (`localhost`/`127.0.0.1`/`::1`). A misconfigured `mcp.json` pointing at an `http://` remote no longer leaks the credential — the request is sent without it and a warning is logged. (Replaces the warn-only behavior introduced earlier in this release.)
- **Stdio command-injection hardening**: on Windows the stdio transport spawns through `cmd.exe` to resolve `.cmd` shims, which makes the command line shell-interpreted. The bridge now rejects any `command`/`args` containing shell metacharacters before spawning, so a malformed or malicious `mcp.json` cannot inject commands. POSIX spawn passes arguments directly to `execvp` with no shell, so the check is Windows-only.
- **Category whitespace bypass closed**: categories are now trimmed as well as lowercased in `normalizeCandidate` and in the blocked/confirm/auto category sets. A category like `"secret "` (trailing space) previously evaded the blocked-category check.
- **Recalled memory treated as untrusted data**: memory text injected into the system prompt is sanitized (forged fence tokens stripped) and wrapped in explicit `<<<AUTOMEM_RECALL_DATA>>>` … `<<<END_AUTOMEM_RECALL_DATA>>>` fences with an instruction to treat everything inside strictly as reference data, never as agent instructions. Mitigates stored-memory prompt injection.
- **Relationship type validated before write**: `automem_link_memories` now validates `relationship` against the 11-type enum and clamps `strength` to [0, 1] before calling AutoMem.
- **`NaN` write-threshold guarded**: a non-finite `minImportanceToWrite` in config now falls back to `0.7` instead of silently disabling the importance gate.

### Changed
- **Pinned the pi SDK peer dependency** to a tested range (`@earendil-works/pi-coding-agent >=0.78.0 <0.81.0`). A future breaking pi release now surfaces as a clear peer-dependency warning at install time instead of a silent runtime break; the ceiling is widened deliberately after each SDK version is tested.
- **Internal refactor (ponytail audit)**: removed dead code and simplified the MCP client with no behavior change — dropped the unused `McpLifecycle` type and `getAutoMemMcpLifecycle()`, the dead `hasSecrets` helper, and a speculative NDJSON branch in the recall parser; replaced the cached-server-config object plus the 3-way tool-discovery index (and its 12-entry fallback map) with a lightweight mtime/size signature map and a single `automem_`-prefix flag.
- README: updated "Before you begin" and Step 3 to cover the stdio scenario (wizard installs now work as-is rather than requiring a separate HTTP service); documented secret/PII write-blocking and the https-for-auth requirement; added a **Security & privacy** section.

## 0.3.0 — 2026-06-28

### Fixed
- **Structured recall**: `recall_memory` calls now request `format: "json"` from the server, returning a structured JSON object instead of human-readable text. The `parseSearchResults` parser handles this object format (top-level `{ results: [...] }`) as the primary path. The text-format parser is retained as a fallback.
- **Actionable setup messages**: `mcp.json` URL problems are flagged early with plain-English text — a hard error for an unparseable URL, and warnings for a missing `/mcp` path or a plaintext `http://` host — instead of an opaque `TypeError: Invalid URL` or `MCP HTTP 404` surfacing deep in the call stack.
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
