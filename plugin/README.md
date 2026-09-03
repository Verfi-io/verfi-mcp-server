# Verfi Agent Plugin

An [Agent Plugins](https://agent-plugins.org/) v1.0.0 package that bundles Verfi's
consent-verification tooling into one portable directory any compatible client
(Cursor, Claude, OpenAI, etc.) can discover and load.

TCPA consent verification for lead generation: verify lead consent before
contact, pull machine-readable proof for disputes, and manage consent sessions
via the Verfi API.

## What's inside

```
plugin/
├── plugin.json          # manifest (Agent Plugins 1.0.0)
├── mcp.json             # MCP server config (stdio via @verfi/mcp-server)
└── skills/
    └── verfi/
        ├── SKILL.md     # Verfi consent-verification skill (canonical source)
        └── references/  # api-reference, proof-schema, sdk-reference
```

- **Skill** — SDK install, API auth, session lifecycle (create → claim → verify → proof), compliance workflows. This is the canonical home for the Verfi skill.
- **MCP server** — 8 tools including `verfi_verify_consent` (the primary compliance check). Source lives in this repo's [`src/`](../src); published as [`@verfi/mcp-server`](https://www.npmjs.com/package/@verfi/mcp-server).

## Install

Clone or copy this `plugin/` directory into your client's Agent Plugins location,
then set your Verfi secret key. Clients expand `${VERFI_API_KEY}` from the
environment at load time:

```
export VERFI_API_KEY=sk_you…here
```

Generate keys in the [Verfi dashboard](https://app.verfi.io) under Integration > API Keys.
Key scopes determine which tools are available (`sessions:proof`, `sessions:claim`, etc.).

## Remote transport (optional)

The stdio config runs the published npm package locally. For a hosted deployment,
swap the `verfi` entry in `mcp.json` for a `streamable-http` server pointing at
your Verfi MCP endpoint. Do not embed secrets in headers — authorization is
client-managed per the spec.

## Spec conformance

Both `plugin.json` and `mcp.json` validate against the canonical
[1.0.0 schemas](https://agent-plugins.org/schemas/). License: MIT.
