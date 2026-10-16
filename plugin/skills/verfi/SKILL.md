---
name: verfi
description: TCPA consent verification for lead generation. Use when adding consent capture to web forms, verifying lead consent before contact, claiming/managing consent sessions, pulling proof for disputed leads, or integrating with the Verfi API. Covers SDK installation, API authentication, session lifecycle (create → claim → verify → proof), and compliance workflows.
---

# Verfi — Consent Verification for Lead Gen

Verfi captures verifiable proof of consumer consent. Publishers add a script tag to capture sessions; buyers verify consent via API before contacting leads.

## When to Use This Skill

- Adding consent capture to a web form
- Checking if a lead has valid TCPA consent
- Claiming sessions for long-term retention
- Pulling machine-readable proof for disputes
- Integrating Verfi into an existing lead gen pipeline

## Lead-router integration

For claim gates, PII binding, status mapping and retries, read [references/api-reference.md](references/api-reference.md) before writing the integration. It is the web-session buyer contract. Entry point: https://verfi.io/docs/agent-plugin. Direct REST does not require plugin installation. Native lead-form evidence is a different contract.

Use buyer-selected thresholds and match policy. Validate required PII before claiming; accept only exact successful claim response fields. A proof summary or a claim alone is not a legal-compliance guarantee. Inspect MCP tools/list: older installed releases lack the gates and claim-status tool. Use direct REST when needed.

## Quick Start

### 1. Capture Consent (Publisher)

Add the SDK to any page with a form:

```html
<script async src="https://sdk.verfi.io/v2/index.js?field=verfiProof&apiKey=YOUR_PUBLIC_KEY&verticals=auto_insurance"></script>
```

The SDK auto-detects forms, records interactions (mouse, clicks, keystrokes, scroll), and generates a Verfi ID (`VF-xxxxxxxx`) on form submission.

### 2. Verify Consent (Buyer)

```bash
curl -H "Authorization: Bearer sk_YOUR_SECRET_KEY" \
  https://api.verfi.io/tenant/v1/sessions/VF-a1b2c3d4/proof
```

Returns consent status, interaction metrics, form data, device info, and tamper verification. All PII is SHA-256 hashed.

### 3. Claim Session

```bash
curl -X POST -H "Authorization: Bearer sk_YOUR_SECRET_KEY" \
  -H "Idempotency-Key: REPLACE_WITH_PERSISTED_UUID" \
  -H "Content-Type: application/json" -d '{"requireRecording":true,"requireVerticals":["auto_insurance"]}' \
  https://api.verfi.io/tenant/v1/sessions/VF-a1b2c3d4/claim
```

Starts 3-year retention. Unclaimed sessions expire in 72 hours.

## Authentication

Two key types:

| Key | Format | Use |
|-----|--------|-----|
| Public | `pk_...` | SDK script tag (client-side) |
| Secret | `sk_...` | API calls (server-side, Bearer token) |

Secret keys have scopes: `sessions:claim`, `sessions:unclaim`, `sessions:search`, `sessions:proof`, `sessions:expiration`, `sessions:quality`.

Generate keys in the [Verfi dashboard](https://app.verfi.io) under Integration > API Keys.

## API Endpoints

Base URL: `https://api.verfi.io/tenant/v1`

All endpoints require `Authorization: Bearer sk_...` header.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/sessions` | — | List claimed sessions (paginated) |
| GET | `/sessions/{verfiID}` | `sessions:search` | Look up session, verify PII hashes |
| GET | `/sessions/{verfiID}/proof` | `sessions:proof` | Machine-readable proof data |
| POST | `/sessions/{verfiID}/claim` | `sessions:claim` | Claim session (3-year retention) |
| POST | `/sessions/{verfiID}/unclaim` | `sessions:unclaim` | Release session (30-day retention) |
| PUT | `/sessions/{verfiID}/expiration` | `sessions:expiration` | Update expiration date |

Full API reference: see [references/api-reference.md](references/api-reference.md)

## Common Workflows

### Publisher: Add Consent Capture to a Form

1. Get a public API key from the Verfi dashboard
2. Add the SDK script tag to the page (before `</body>`)
3. The SDK auto-records sessions — no form modifications needed
4. Each form submission creates a session with a unique Verfi ID
5. Pass the Verfi ID alongside the lead data to buyers

### Buyer: Verify and Claim a Lead

1. Receive lead with Verfi ID from publisher
2. Call `GET /sessions/{verfiID}/proof` to check consent
3. Inspect `data.consent` evidence against the buyer's policy; do not interpret heuristic flags as a legal determination
4. If the buyer requires PII binding, call `GET /sessions/{verfiID}?email={hash}&phone={hash}` and require found=true and each selected match=true before claiming
5. Call `POST /sessions/{verfiID}/claim` with buyer gates and a persisted idempotency key; see the integration contract
6. Require all selected PII checks and exact claim success before passing the lead; apply the buyer's separate contact/consent policy

### Dispute: Pull Proof for a Challenged Lead

1. Look up the Verfi ID associated with the disputed lead
2. Call `GET /sessions/{verfiID}/proof` for machine-readable proof
3. Proof includes: consent language, interaction timeline, form data, device info, tamper detection
4. Share the `proof_url` for a human-readable proof page
5. Integrity hash verifies the proof hasn't been tampered with

### Audit: Bulk Verify Consent Across a Lead List

1. Call `GET /sessions` to list all claimed sessions
2. For each session, call `GET /sessions/{verfiID}/proof`
3. Flag sessions where `consent.given === false` or `verification.tamper_detected === true`
4. Flag failures for the buyer's policy; do not automatically unclaim retained evidence

## MCP Server

For MCP-compatible agents (Claude Desktop, Cursor, Windsurf):

```json
{
  "mcpServers": {
    "verfi": {
      "command": "npx",
      "args": ["-y", "@verfi/mcp-server"],
      "env": { "VERFI_API_KEY": "sk_..." }
    }
  }
}
```

## OpenAPI Spec

Auto-discoverable at: `https://api.verfi.io/.well-known/openapi.json`

Compatible with OpenAI GPT Actions, LangChain, CrewAI, and any framework that generates tools from OpenAPI specs.

## Troubleshooting

| Problem | Fix |
|---------|-----|
| SDK not recording sessions | Check public key is correct, script loads without errors |
| 401 Unauthorized | Verify secret key, check `Authorization: Bearer sk_...` format |
| 403 Insufficient permissions | API key missing required scope — update in dashboard |
| Session not claimable (409) | Session already claimed or status isn't "recorded" |
| Proof shows `consent.given: false` | Form may not have consent language/checkbox detected by SDK |
