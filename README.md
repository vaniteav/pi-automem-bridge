<div align="center">

![pi-automem-bridge](assets/banner.png)

# pi-automem-bridge

> **AutoMem is the memory. This bridge ensures pi actually uses it.**

Automatic recall and a secret-scanning, policy-gated write pipeline for [pi](https://github.com/earendil-works/pi) — wired to your AutoMem instance, **local or remote**.

```bash
pi install npm:pi-automem-bridge
```

[![npm version](https://img.shields.io/npm/v/pi-automem-bridge)](https://www.npmjs.com/package/pi-automem-bridge)
[![npm downloads](https://img.shields.io/npm/dw/pi-automem-bridge)](https://www.npmjs.com/package/pi-automem-bridge)

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/L2J320X82M)

</div>

---

## Why pi-automem-bridge

Plenty of agents can store a memory. Far fewer reach for it when it counts — or check what they're scribbling down. pi-automem-bridge makes pi do both, automatically: startup + per-turn recall injected straight into the prompt, and a secret-scanning, policy-gated write pipeline guarding the door to AutoMem.

- **Works with any AutoMem setup — local or remote.** Point it at a hosted HTTP endpoint (Railway or self-hosted Docker) *or* a local mcp-automem subprocess — the very same stdio install Claude Desktop and Cursor use. The bridge auto-detects the transport from your `mcp.json` and manages the connection either way: plain HTTP calls, or spawning and supervising the subprocess. Already configured mcp-automem for another tool? It just works — no second endpoint to stand up.
- **Per-project scoping** — recall limits and filters tuned to the repo or folder you're working in.
- **Safe by default** — every write is secret- and PII-scanned and policy-gated, your auth token is never sent in the clear, and recalled memory is treated as untrusted data. See [Security & privacy](#security--privacy).

> The storage and the recall/similarity intelligence are [AutoMem](https://github.com/verygoodplugins/automem)'s. This package is the guardrail-and-automation layer that makes them automatic inside pi.

---

## How it works

Once installed, the bridge connects to AutoMem over whichever transport your `mcp.json` declares — a remote HTTP endpoint or a local subprocess — then hooks into pi's session lifecycle:

- **At session start** it connects to your AutoMem endpoint (or spawns the local subprocess), discovers available tools, runs your startup recall queries, and injects the results — your preferences, working style, and environment — into the system prompt.
- **Before each turn** it recalls memories relevant to the current task and the detected project, again injected silently.
- **When the agent writes a memory** the candidate passes through the write pipeline — normalize → secret-scan → policy check → dedupe → confirm or auto-store — so nothing unvetted reaches AutoMem.
- **Relationship tools** let the agent link memories or record corrections with provenance, building a connected graph over time.

Recall display, write policy, and per-project scoping are all configurable — see the [Configuration reference](#configuration-reference).

---

## Before you begin

This bridge connects pi to AutoMem's MCP tools — over a remote HTTP endpoint **or** a local subprocess, whichever you have. You need:

1. **[pi](https://github.com/earendil-works/pi)** — the agent this extension runs inside.
2. **The [AutoMem](https://github.com/verygoodplugins/automem) backend** — the graph-vector store (Railway or self-hosted Docker). This is the storage layer everything else depends on.
3. **A way to reach AutoMem's MCP tools** — *either* of:
   - a hosted **HTTP endpoint** — the [mcp-automem](https://github.com/verygoodplugins/mcp-automem) sidecar deployed as a service (Railway or Docker), the URL the bridge posts to; or
   - a local **stdio subprocess** — the same `npx @verygoodplugins/mcp-automem` install the Claude Desktop / Cursor wizard sets up.

   You only need one. The bridge auto-detects which from your `mcp.json`: a `url` entry → HTTP, a `command` entry → stdio.

The bridge also works with nothing configured — it degrades gracefully to offline mode. In offline mode, startup and turn-level recall are disabled and memory writes will fail, but pi runs normally.

### Finding your endpoint URL

**Railway deployment (most common)**

Open your Railway project → select the **mcp-automem** service → **Settings → Domains**. Your endpoint URL is:

```
https://<your-service-name>.up.railway.app/mcp
```

The `/mcp` suffix and `https://` scheme are both required.

Your auth token is in the mcp-automem service → **Variables** → copy the value of `AUTOMEM_API_TOKEN`. You'll store this locally under whatever name you choose (see step 2 of Setup).

**Local Docker**

If you're running the mcp-automem sidecar as a local HTTP server (not the stdio subprocess), check the port in your Docker Compose or mcp-automem config — it varies by setup.

**Already ran the mcp-automem wizard?** If you ran `npx @verygoodplugins/mcp-automem setup` or `install` to configure Claude Desktop, Cursor, or another local agent, that wizard created a stdio subprocess entry in your mcp.json — and the bridge supports that directly. Your existing mcp.json entry works as-is; just point `mcpServerName` at it in step 5 if it isn't named `automem`.

---

## Setup

Four steps to a working install, then optional tuning. The only things you must configure by hand are your auth token and the server URL — the package has no way to know your private credentials.

### 1. Install the package

```bash
pi install npm:pi-automem-bridge
```

The extension registers itself with pi immediately. Recall and memory features remain in offline mode until you complete the remaining steps.

### 2. Set your auth token as an environment variable — *required*

Your AutoMem token must be in the environment before the bridge can use it — never paste it directly into config files.

Railway users: copy the value of `AUTOMEM_API_TOKEN` from your mcp-automem service Variables. You'll store it locally under a name of your choosing — `AUTOMEM_TOKEN` is used in the examples below, but any name works as long as you use the same name in step 3.

**Windows (PowerShell):**
```powershell
setx AUTOMEM_TOKEN "paste-your-token-here"
```
`setx` persists the variable for all future sessions. **Open a new terminal window after running it** — the current window will not see the new value.

**macOS / Linux:**
```bash
echo 'export AUTOMEM_TOKEN="paste-your-token-here"' >> ~/.zshrc   # or ~/.bashrc
source ~/.zshrc
```

Verify with `echo $AUTOMEM_TOKEN` (should print your token, not blank).

### 3. Connect it to your AutoMem server — *required*

The URL must include `https://` and end with `/mcp`. The `${AUTOMEM_TOKEN}` reference reads the variable you set in step 2 — never hardcode the token here. The entry must be named `automem` (the default the extension looks for), or configure a different name via `mcpServerName` in step 5.

> **A remote endpoint must use `https://`.** The bridge will not send your token over plaintext `http://` to a non-loopback host — it connects without credentials rather than leak them, which then fails auth. Local `http://localhost` (or `127.0.0.1` / `::1`) is fine for a sidecar on your own machine.

**Let pi write it (works for all cases):**

Open pi and say:

> *"Add an `automem` MCP server to my `~/.pi/agent/mcp.json` at `https://YOUR-URL/mcp`, bearer auth using `${AUTOMEM_TOKEN}`. Keep any existing server entries."*

Pi handles both a missing file and an existing one with other servers — you just substitute your URL.

**Or edit the file yourself:**

*No mcp.json yet* — create `~/.pi/agent/mcp.json`:

```json
{
  "mcpServers": {
    "automem": {
      "url": "https://YOUR-URL/mcp",
      "headers": { "Authorization": "Bearer ${AUTOMEM_TOKEN}" }
    }
  }
}
```

*Already have a mcp.json with other servers* — add the `automem` block alongside your existing entries:

```json
{
  "mcpServers": {
    "your-existing-server": { "...": "..." },
    "automem": {
      "url": "https://YOUR-URL/mcp",
      "headers": { "Authorization": "Bearer ${AUTOMEM_TOKEN}" }
    }
  }
}
```

*Using a local stdio subprocess* — if the mcp-automem wizard already created an entry in your mcp.json, it looks something like this and works without changes:

```json
{
  "mcpServers": {
    "automem": {
      "command": "npx",
      "args": ["-y", "@verygoodplugins/mcp-automem"],
      "env": { "AUTOMEM_TOKEN": "your-token" }
    }
  }
}
```

The bridge detects the transport automatically: `url` → HTTP, `command` → stdio. No extra config needed.

### 4. Reload pi

Start a new session or run `/reload`. **That's it — recall is now automatic and the bridge runs on sensible defaults** (`safe-auto` writes, `summary` recall display). From here, just work: pi recalls on its own and saves routine decisions automatically — tell it *"remember this"* anytime you want something kept. Confirm everything's live with `/automem-status`.

### 5. Tune behavior — *optional*

The bridge works fully without this file. To customize recall queries, write policy, per-project scoping, or display mode, create `~/.pi/agent/automem.json` — any value you leave out falls back to its default. (Or just tell pi what you want — *"only auto-save bug fixes and technical decisions, and hide the recall block"* — and have it write the file for you.)

```json
{
  "mcpServerName": "automem",
  "startupRecall": {
    "queries": [
      "user preferences working style",
      "current environment setup",
      "active projects and recent decisions"
    ]
  },
  "behavior": {
    "displayRecall": "summary"
  }
}
```

Every option — with real values you can copy — is in the [Configuration reference](#configuration-reference) below.

---

## Commands

| Command | What it does |
|---|---|
| `/automem-status` | Health check — shows memory count and active config |
| `/automem-recall <query>` | Manual recall query for debugging |

## Tools

You don't type these — pi does, in plain conversation. Tell it *"remember that I prefer Vitest over Jest"* and it runs the thought through the write pipeline before storing; say *"actually, we moved off Railway"* and it records a correction with provenance. In `safe-auto` mode it also captures routine decisions on its own, no prompting needed.

| Tool | What it does |
|---|---|
| `automem_propose_memory` | Preview a memory candidate — validates, scans for secrets, checks for duplicates. Does not write. |
| `automem_commit_memory` | Store a policy-approved memory. Returns `DUPLICATE_DETECTED` if a similar memory exists. |
| `automem_update_memory` | Update an existing memory by ID. Enforces `writePolicy.mode`, scans `content`/`metadata` for secrets and PII, rejects over-length content, and blocks any tag or inferred category that falls under `blockedCategories`. Updatable fields: `content`, `type`, `tags` (replaces existing), `importance`, `confidence`, `metadata` (merged). |
| `automem_link_memories` | Create a typed relationship between two existing memories. |
| `automem_correct_memory` | Store a correction and link old → new with a provenance relationship (EVOLVED_INTO or CONTRADICTS). |

Policy blocks, missing approval in non-interactive contexts, and invalid update requests surface as pi tool errors. User-cancelled confirmations and duplicate detection are normal control-flow results, so the agent can stop or choose the next write path deliberately.

### Relationship types

`automem_link_memories` accepts any of the 11 built-in AutoMem relationship types:

`RELATES_TO` · `LEADS_TO` · `OCCURRED_BEFORE` · `PREFERS_OVER` · `EXEMPLIFIES` · `CONTRADICTS` · `REINFORCES` · `INVALIDATED_BY` · `EVOLVED_INTO` · `DERIVED_FROM` · `PART_OF`

---

## Write policy

New memories go through: normalize → secret/PII scan → policy check → dedupe → confirm/auto → store. Updates (`automem_update_memory`) run a focused subset of the same gate — `mode`, the secret/PII scan, the content-length cap, and blocked categories — while dedupe and the propose/confirm flow apply to new candidates only.

The secret/PII scan blocks a write outright when it detects credentials (API keys, bearer tokens, private keys, AWS keys, connection strings) or basic personal data (email addresses, US Social Security numbers). If you deliberately want to keep something that trips it, rephrase it or store a reference rather than the raw value.

```json
{
  "writePolicy": {
    "mode": "safe-auto",
    "autoWriteCategories": ["technical-decision", "agent-pattern", "bug-fix", "tooling-lesson"],
    "confirmCategories": ["personal", "financial", "private", "identity"],
    "blockedCategories": ["secret", "credential", "api-key", "raw-transcript"],
    "minImportanceToWrite": 0.7,
    "dedupeBeforeWrite": true,
    "dedupeMinScore": 0.85
  }
}
```

| Mode | Behavior |
|---|---|
| `safe-auto` | Auto-write configured low-risk categories; confirm everything else. **Default.** |
| `propose` | Propose all candidates; require explicit approval to commit. |
| `confirm-all` | Confirm every write individually. |
| `off` | Block all writes. |

### Duplicate handling

When a commit finds a close match — recall similarity at or above `dedupeMinScore` (default `0.85`) — `automem_commit_memory` returns `DUPLICATE_DETECTED` with the existing memory's ID. Options:
1. Update it — call `automem_update_memory` with the returned ID, or re-call `automem_commit_memory` with `updateMemoryId` set to the returned ID
2. Force a new store — set `dedupeQuery: ""` to skip the check
3. Cancel — do nothing if the existing memory already covers it

Lower `dedupeMinScore` to catch looser duplicates, or raise it to flag only near-identical ones. (Recall results without a similarity score always surface as candidates.)

---

## Security & privacy

The bridge sits between your agent and long-term storage, so it's built to fail safe. What it guards, and how:

- **Secrets and PII never get stored silently.** Every write — new *or* update — is scanned for credentials (API keys, bearer tokens, private keys, AWS keys, connection strings) and basic personal data (email addresses, US SSNs). A match **blocks the write**, and the agent is told only the *kind* of thing found, never the value. To keep something that trips the scanner, rephrase it or store a reference instead of the raw secret.
- **Your auth token is never sent in the clear.** The `Authorization` header goes only to `https://` endpoints or a local `http://` loopback host (`localhost` / `127.0.0.1` / `::1`). Point the bridge at a plaintext remote `http://` URL and it connects *without* the token rather than leak it — so use `https://` for anything off your machine.
- **Recalled memory is treated as untrusted data.** Memories are injected into the system prompt inside explicit fences that tell the model to treat the content as reference data, not instructions, and any text trying to forge those fences is stripped first. A poisoned memory can't quietly hijack a later turn.
- **Writes are policy-gated, not a free-for-all.** The default `safe-auto` mode auto-stores only the low-risk categories you configure and asks before anything else; `confirm-all`, `propose`, and `off` tighten that further. Blocked categories and a minimum-importance threshold keep noise and sensitive classes out. See [Write policy](#write-policy).
- **On Windows, subprocess transports are injection-hardened.** Stdio MCP servers are spawned through `cmd.exe` to resolve `.cmd` shims; the bridge rejects any command or argument containing shell metacharacters first, so a tampered `mcp.json` can't smuggle in a second command.

None of this replaces good hygiene on the AutoMem backend itself — auth, network exposure, and backups live there; see the [AutoMem](https://github.com/verygoodplugins/automem) docs for that side.

---

## Configuration reference

Config file: `~/.pi/agent/automem.json`. Override the path with the `AUTOMEM_CONFIG_PATH` environment variable — useful for per-project configs or CI environments where you want different recall behavior per repo.

| Section | Purpose |
|---|---|
| `mcpServerName` | Which server in `mcp.json` to use (default: `"automem"`) |
| `startupRecall` | Queries, tags, limits, byte budget, and timeout for session-start recall |
| `turnRecall` | Per-prompt recall: limits, memory types, relation/entity expansion, and timeout |
| `projectDetection` | Map git repos and folder names to project tags for scoped recall |
| `projectOverrides` | Per-project overrides for turn recall limits and filters |
| `writePolicy` | Write mode, categories, importance threshold, dedupe settings |
| `behavior` | Display mode and content-length preferences |

Set only the keys you want to change — everything else uses its default. Two ready-to-edit starting points ship with the package:

- **[`config.minimal.json`](https://github.com/vaniteav/pi-automem-bridge/blob/main/examples/config.minimal.json)** — the smallest useful config.
- **[`config.advanced.json`](https://github.com/vaniteav/pi-automem-bridge/blob/main/examples/config.advanced.json)** — every option above, filled in with real values and sensible defaults. Copy it, trim what you don't need.

### Recall display (`behavior.displayRecall`)

Controls how much of the recalled context shows in chat. Injection into the system prompt happens regardless.

| Mode | Behavior |
|---|---|
| `hidden` | Inject into system prompt only. Nothing shown in chat. |
| `summary` | Inject into system prompt + show a compact notification. **Default.** |
| `full` | Show the full recall block. Useful for debugging. |

### Recall timeouts

Recall is best-effort context enrichment, so it runs on a short, bounded timeout instead of the full MCP request timeout — a slow or unreachable AutoMem server degrades gracefully to no injection rather than blocking your prompt. Tune with `turnRecall.timeoutMs` (default `8000`) and `startupRecall.timeoutMs` (default `15000`).

The bridge performs an eager health check at session start to warm the AutoMem connection. If that early check races startup and misses, later turns retry with a short timeout and run the missed startup recall after AutoMem recovers. `/automem-status` is useful for manual diagnostics.

### Project detection

`projectDetection` scopes turn recall to the active project by tagging queries with a project identifier. The bridge walks up the directory tree from `cwd`, matches the first `.git` remote URL against your `gitRepoToTag` map, and falls back to folder name matching via `folderTags`. Unrecognized repos get unscoped recall.

```json
{
  "projectDetection": {
    "enabled": true,
    "gitRepoToTag": {
      "my-app": "project:my-app",
      "github.com/me/other-repo": "project:other-repo"
    },
    "folderTags": {
      "projects": ["project"],
      "work": ["work"]
    }
  }
}
```

Tags stored by the bridge are lowercased; recall filters match on the same lowercased value.

---

## Development

```bash
git clone https://github.com/vaniteav/pi-automem-bridge.git
cd pi-automem-bridge
npm install
npm test               # offline tests
npm run test:smoke     # live smoke test (requires AutoMem)
npm run test:live      # full round-trip write test (requires AutoMem)
```

### Extension API

The bridge publishes its core functions so other pi extensions can build on them. All are importable from the published `src/` directory (TypeScript — requires `tsx` or a TS-aware bundler):

```typescript
import { automemRecall, automemStore, automemUpdate, automemHealth, loadConfigAndActivate } from 'pi-automem-bridge/src/mcp-client';
import { evaluateWritePolicy, normalizeCandidate } from 'pi-automem-bridge/src/write-policy';
import { loadConfig } from 'pi-automem-bridge/src/config';
import { detectProject } from 'pi-automem-bridge/src/project-detect';
import { parseSearchResults } from 'pi-automem-bridge/src/recall';
```

`automemRecall(query, options?, timeoutMs?)` — query AutoMem; returns the raw MCP result. Respects the active server name.

`automemStore(content, type, tags, options?)` — store a memory. Skips the write-policy pipeline — call `evaluateWritePolicy` first if you want policy enforcement.

`evaluateWritePolicy(candidate, config)` — run the full normalize → secret-scan → policy-check pipeline. Returns `{ action, reasons, findings, normalized }` without writing anything.

`loadConfig()` — load and merge `automem.json` with defaults. Safe to call repeatedly; always returns a fresh clone.

`loadConfigAndActivate()` — `loadConfig()` + activate the configured MCP server name in one call. Preferred over calling both separately.

`detectProject(cwd, prompt, config)` — infer project tag from git remote, folder name, or prompt text.

The MCP server name and connection details are read from `~/.pi/agent/mcp.json` at call time. Use `loadConfigAndActivate()` at the start of each handler — it loads `automem.json`, activates the configured server name, and returns the config object.

---

## Credits

This package builds on three excellent open-source projects:

- **[pi](https://github.com/earendil-works/pi)** by [Earendil Works](https://github.com/earendil-works) — the extensible AI agent toolkit this package runs on
- **[AutoMem](https://github.com/verygoodplugins/automem)** by [Very Good Plugins](https://github.com/verygoodplugins) — the graph-vector memory service powering recall and storage
- **[mcp-automem](https://github.com/verygoodplugins/mcp-automem)** by [Very Good Plugins](https://github.com/verygoodplugins) — the HTTP MCP sidecar service this extension connects to for tool access

---

## License

MIT — [vaniteav](https://github.com/vaniteav)

---
