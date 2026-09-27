# Harness model — a canonical, host-neutral read of the surface

The **harness model** is a canonical, host-neutral description of an agentic
harness, derived from sdlc's live Claude Code surface. See
[[D-HRNS-harness-model-and-exporters]] and
[[C-HRNS-multi-harness-control-plane]]. Its per-host exporters (Claude, Codex,
Cursor, Gemini, portable JSON) and `sdlc harness export` were retired in
[[T-1NWG]] once the agent-pants vault build became sdlc's sole build path for
producing the plugin itself; `harness model` remains as a read-only
introspection op.

## Model shape

`packages/ts/agent-plugin/model.ts` — a plain, JSON-serializable Zod shape.

| Field | Is |
|---|---|
| `metadata` | name, version, description, author, homepage |
| `capabilities[]` | `kind` (skill \| command), name, description, instructions, allowedTools, argumentHint, resources[], annotations |
| `hooks[]` | event, matcher, action (shell command) |
| `mcpServers[]` | name, transport (stdio \| http \| sse), command/args/env or url/headers |
| `permissions` | allow[], deny[], ask[] |
| `documents[]` | name, body (shared context / conventions) |

Capability and document markdown bodies validate through
`packages/ts/agent-plugin/contract.ts` (markdown-contract): well-formedness
plus a required level-1 title.

## Ops

| Command | Does |
|---|---|
| `sdlc harness model [--output json]` | Derive + emit the model from the running plugin (or `--root <dir>`). |

## Bootstrapping

The model is bootstrapped from an existing Claude surface with
`importClaude(pluginRoot)` (an alias for `deriveHarnessModel`): it reads
`skills/`, `conventions/`, and the control plane in `.claude/settings.json` +
`.mcp.json`. Use it to introspect what a built plugin actually carries — it is
a read of the surface, not a second way to produce one.
