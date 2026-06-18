<div align="center">

![pi-automem-bridge](assets/banner.png)

# pi-automem-bridge

> **AutoMem is the memory. This bridge ensures pi actually uses it.**

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

- **Per-project scoping** — recall limits and filters tuned to the repo or folder you're working in.
- **Bring your own AutoMem** — talks to your existing instance over MCP. No duplicate credentials or storage to manage.

> The storage and the recall/similarity intelligence are [AutoMem](https://github.com/verygoodplugins/automem)'s. This package is the guardrail-and-automation layer that makes them automatic inside pi.

---

## How it works

Once installed, the bridge hooks into pi's session lifecycle:

- **At session start** it runs your startup recall queries against AutoMem and injects the results — your preferences, working style, and environment — into the system prompt.
- **Before each turn** it recalls memories relevant to the current task and the detected project, again injected silently.
- **When the agent writes a memory** the candidate passes through the write pipeline — normalize → secret-scan → policy check → dedupe → confirm or auto-store — so nothing unvetted reaches AutoMem.
- **Relationship tools** let the agent link memories or record corrections with provenance, building a connected graph over time.

Recall display, write policy, and per-project scoping are all configurable — see the [Configuration reference](#configuration-reference).

---

## Before you begin

This package does not include pi or AutoMem — it connects them. You need both running independently first:

1. **[pi](https://github.com/earendil-works/pi)** — the agent this extension runs inside
2. **[AutoMem](https://github.com/verygoodplugins/automem)** — the graph-vector memory service (self-hosted or Railway)
3. **[mcp-automem](https://github.com/verygoodplugins/mcp-automem)** — the MCP bridge that exposes AutoMem's tools over the MCP protocol

Once those three are in place, follow the setup below.

---

## Setup

Three steps to a working install, then optional tuning. The package install is automatic — the **only** thing you must configure by hand is the connection to your own AutoMem server, because that carries your private server URL and token, and no package can (or should) write those for you.

### 1. Install the package

```bash
pi install npm:pi-automem-bridge
```

This registers the extension's tools, commands, and recall hooks with pi automatically. Nothing runs yet — it has no server to talk to.

### 2. Connect it to your AutoMem server — *required*

Add an MCP server entry named `automem` to `~/.pi/agent/mcp.json`, pointing at the AutoMem instance from [Before you begin](#before-you-begin):

```json
{
  "mcpServers": {
    "automem": {
      "url": "https://your-automem-server.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${AUTOMEM_TOKEN}"
      }
    }
  }
}
```

This is the one step that can't be automated: the package has no way to know your server's address or auth token, and writing credentials on your behalf would be unsafe. Use `${ENV_VAR}` interpolation for the token — never hardcode secrets. The entry must be named `automem` (the name the extension looks for by default), or set a different name via `mcpServerName` in step 4.

**Don't want to hand-edit JSON?** pi is a coding agent — tell it to do it: *"add an `automem` MCP server to my `mcp.json` at `https://my-server.example.com/mcp`, using `${AUTOMEM_TOKEN}` for auth."* Keep the real token in your environment so it never touches the file or the chat.

### 3. Reload pi

Start a new session or run `/reload`. **That's it — recall is now automatic and the bridge runs on sensible defaults** (`safe-auto` writes, `summary` recall display). From here, just work: pi recalls on its own and saves routine decisions automatically — tell it *"remember this"* anytime you want something kept. Confirm everything's live with `/automem-status`.

### 4. Tune behavior — *optional*

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
| `automem_update_memory` | Update an existing memory by ID. |
| `automem_link_memories` | Create a typed relationship between two existing memories. |
| `automem_correct_memory` | Store a correction and link old → new with a provenance relationship (EVOLVED_INTO or CONTRADICTS). |

Policy blocks, missing approval in non-interactive contexts, and invalid update requests surface as pi tool errors. User-cancelled confirmations and duplicate detection are normal control-flow results, so the agent can stop or choose the next write path deliberately.

---

## Write policy

Every write goes through: normalize → secret scan → policy check → dedupe → confirm/auto → store. Nothing bypasses this pipeline.

```json
{
  "writePolicy": {
    "mode": "safe-auto",
    "autoWriteCategories": ["technical-decision", "agent-pattern", "bug-fix", "tooling-lesson"],
    "confirmCategories": ["personal", "financial", "private", "identity"],
    "blockedCategories": ["secret", "credential", "api-key", "raw-transcript"],
    "minImportanceToWrite": 0.7,
    "dedupeBeforeWrite": true
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

When a commit finds a close match, `automem_commit_memory` returns `DUPLICATE_DETECTED` with the existing memory's ID. Options:
1. Update it — re-call with `updateMemoryId` set to the returned ID
2. Force a new store — set `dedupeQuery: ""` to skip the check
3. Cancel — do nothing if the existing memory already covers it

---

## Configuration reference

Config file: `~/.pi/agent/automem.json` (or `AUTOMEM_CONFIG_PATH`)

| Section | Purpose |
|---|---|
| `mcpServerName` | Which server in `mcp.json` to use |
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
| `summary` | Inject into system prompt + show a compact notification. |
| `full` | Show the full recall block. Useful for debugging. |

### Recall timeouts

Recall is best-effort context enrichment, so it runs on a short, bounded timeout instead of the full MCP request timeout — a slow or unreachable AutoMem server degrades gracefully to no injection rather than blocking your prompt. Tune with `turnRecall.timeoutMs` (default `8000`) and `startupRecall.timeoutMs` (default `15000`).

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


---

## Credits

This package builds on two excellent open-source projects:

- **[pi](https://github.com/earendil-works/pi)** by [Earendil Works](https://github.com/earendil-works) — the extensible AI agent toolkit this package runs on
- **[AutoMem](https://github.com/verygoodplugins/automem)** by [Very Good Plugins](https://github.com/verygoodplugins) — the graph-vector memory service powering recall and storage
- **[mcp-automem](https://github.com/verygoodplugins/mcp-automem)** by [Very Good Plugins](https://github.com/verygoodplugins) — the MCP bridge this extension communicates through

---

## License

MIT — [vaniteav](https://github.com/vaniteav)

---
