# @verfi/mcp-server

MCP server for [Verfi](https://verfi.io) — TCPA consent verification tools for AI agents.

## Tools

| Tool | Description |
|------|-------------|
| `verfi_verify_consent` | Check if a lead has valid consent. The primary tool for compliance verification. |
| `verfi_get_proof` | Get full machine-readable consent proof for a session. |
| `verfi_search_session` | Look up a session by Verfi ID with optional PII hash verification. |
| `verfi_claim_session` | Claim a session (starts 3-year retention). |
| `verfi_unclaim_session` | Release a claimed session. |
| `verfi_list_sessions` | List your claimed sessions (paginated). |
| `verfi_update_expiration` | Update a claimed session's expiration date. |
| `verfi_add_sdk` | Get SDK integration snippet and setup instructions. |

## Setup

### Claude Desktop

Add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "verfi": {
      "command": "npx",
      "args": ["-y", "@verfi/mcp-server"],
      "env": {
        "VERFI_API_KEY": "sk_your_secret_key_here"
      }
    }
  }
}
```

### Cursor / Windsurf

Add to your MCP config:

```json
{
  "verfi": {
    "command": "npx",
    "args": ["-y", "@verfi/mcp-server"],
    "env": {
      "VERFI_API_KEY": "sk_your_secret_key_here"
    }
  }
}
```

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VERFI_API_KEY` | Yes | Your Verfi secret API key (`sk_...`) |
| `VERFI_API_URL` | No | API base URL (defaults to `https://api.verfi.io/tenant/v1`) |

## Agent Plugin

This repo also ships a portable [Agent Plugins](https://agent-plugins.org/) v1.0.0 package in [`plugin/`](./plugin) that bundles this MCP server together with the Verfi consent-verification skill. Compatible clients (Cursor, Claude, OpenAI, etc.) can discover and load both from one directory. See [`plugin/README.md`](./plugin/README.md).

## Quick Start

```
Developer: "Check if lead VF-a1b2c3d4 has valid TCPA consent"

Agent calls: verfi_verify_consent({ verfiID: "VF-a1b2c3d4" })

→ { consent_valid: true, tcpa_compliant: true, proof_url: "..." }
```

## API Key Scopes

Your API key's scopes determine which tools are available:

- `sessions:search` → `verfi_search_session`
- `sessions:proof` → `verfi_get_proof`, `verfi_verify_consent`
- `sessions:claim` → `verfi_claim_session`
- `sessions:unclaim` → `verfi_unclaim_session`
- `sessions:expiration` → `verfi_update_expiration`

Generate API keys in the [Verfi dashboard](https://app.verfi.io) under Integration > API Keys.

## License

MIT
