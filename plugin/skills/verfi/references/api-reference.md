# Verfi web-session buyer integration contract

Entry point: https://verfi.io/docs/agent-plugin
OpenAPI: https://api.verfi.io/.well-known/openapi.json
Scope: SDK-captured web sessions. This guide does not describe native lead-form evidence.

## Authentication and environments

Production base: https://api.verfi.io/tenant/v1
Staging base: https://api.staging.verfi.io/api/tenant/v1
Use `Authorization: Bearer sk_...` server-side and `Content-Type: application/json` for claim bodies. Use the buyer's tenant key, not the publisher's key. Required scopes: `sessions:search` for lookup/status; `sessions:claim` for claims. Proof additionally needs `sessions:proof`. Do not put secret keys in browser code. A lead router's QA system does not automatically make Verfi calls sandboxed: select the intended API environment and account explicitly. Successful production claims may be billed.

## Publisher prerequisite

```html
<script async src="https://sdk.verfi.io/v2/index.js?field=verfiProof&apiKey=YOUR_PUBLIC_KEY&verticals=auto_insurance&claimMode=multi"></script>
```

Pass the populated `verfiProof` field with the lead. The field contains a proof URL with a VF-xxxxxxxx session ID. A missing field is not valid proof. Use the declared vertical appropriate for each lander. `claimMode` defaults to `multi`; `exclusive` permits one active claim across tenants. Mode and declared intent are fixed at session creation, not changed by the buyer's claim request. Test fresh sessions after changing the tag.

## Buyer flow (Ping/Post or other lead router)

1. Require a valid session ID/proof URL. URL-encode the full value if using it as a path parameter, or extract the VF-xxxxxxxx ID.
2. Optionally read `GET /sessions/{verfiID}/claim-status` before buying. Response is `{ "success": true, "data": { "verfiID": "VF-a1b2c3d4", "claimMode": "multi", "claimable": true, "recordingStatus": "valid", "hasValidRecording": true } }`. An active exclusive claim also exposes `claimedAt`, never the other buyer's identity. This does not reserve a claim, evaluate your thresholds, or check your existing claim in multi mode. The final claim is authoritative.
3. If PII binding is required, perform the separate lookup below before claiming. This can run on Post when lead data becomes available. Ping can also validate if the required hashes are supplied; it is not an API restriction.
4. Claim once, with all desired gates in the same JSON body and a persisted idempotency key.
5. Accept only HTTP 200 with `success === true` and `data.status === "claimed"` from the claim response, plus any independently required PII checks. Do not search arbitrary response text for "claimed". Do not treat lookup `data.status` or `claimable` as claim success.

## PII lookup (not a claim-body gate)

`GET /sessions/{verfiID}?email=<SHA256_HEX>&phone=<SHA256_HEX>`

Either parameter may be supplied. Values are lowercase hexadecimal SHA-256 of the exact SDK-captured UTF-8 string. The hash function does not lowercase/trim email or normalize phone formatting. Do not independently normalize or double-hash; mismatched capture/lead formatting will fail. Verify the publisher's captured email/phone field mapping with a real QA fixture.

A successful lookup uses this shape (additional fields omitted):

```json
{"success":true,"data":{"verfiID":"VF-a1b2c3d4","found":true,"status":"recorded","claimMode":"multi","claim":null,"verification":{"emailMatch":true,"phoneMatch":null}}}
```

Require `data.found === true` and each selected match result to be exactly `true`. Omitted checks are null; false/null are not verified matches. Not-found lookups can return HTTP 200 with `found:false`. A mismatch does not itself return 409 or block a later claim. Putting email/phone hashes in the claim body does not perform this check. If the current buyer has a claim, lookup exposes `data.claim.status`; `data.status` remains the session state.

## Claim request

`POST /sessions/{verfiID}/claim`

```json
{
  "requireRecording": true,
  "requireVerticals": ["auto_insurance"],
  "requireVerifiedScore": 0.2,
  "minQualityScore": 50
}
```

These are example QA thresholds, not proven defaults for your traffic. All gates are opt-in. For Home use `["home_insurance"]`, not both Auto and Home unless either is genuinely acceptable. The server cannot infer the router's lead type.

- `requireRecording`: boolean. When true, requires at least two meaningful clicks, scrolls, or form interactions; mouse movement alone does not count. Failure: 409 `no_recording`.
- `requireVerticals`: nonempty array of supported vertical labels (custom `x_` labels supported). Any overlap with declared verticals passes. No declaration is a mismatch. This checks labels, not page content. Failure: 409 `intent_mismatch`.
- `requireVerifiedScore`: number 0–1 inclusive. Cached heuristic keyword score from URL, title, and non-PII form metadata against declared starter verticals; not replay analysis. It averages scores across declared starter verticals, not just the buyer's requested vertical. No declared starter verticals (including custom-only labels) score zero. Failure: 409 `verification_below_threshold`.
- `minQualityScore`: number 0–100 inclusive (whole numbers recommended). Cached behavioral human-confidence score from event timing, interaction patterns and other signals; higher is more human-like, not a bot-free guarantee. Failure: 409 `quality_below_threshold`.
- Optional `expirationDate`: ISO date; default three years, maximum five. Invalid/past/out-of-range values fall back with warnings.

For a new web-session claim, the four gates run in the order above, fail-fast. A 409 reports the first failing condition, not every failure. Gate/exclusive rejections do not create a claim or a new claim charge. A router rejecting a lead after a successful claim does not undo that claim or charge.

Successful claim shape (additional fields depend on billing mode):

```json
{"success":true,"data":{"verfiID":"VF-a1b2c3d4","claimId":"...","status":"claimed","tenantId":"...","claimedAt":"2026-10-16T12:00:00.000Z","expirationDate":"2029-10-16T12:00:00.000Z"}}
```

## Idempotency and errors

Supply `Idempotency-Key` as a stable 16–128 character string containing letters, digits, underscore or hyphen (a UUID is suitable). Required for wallet-enrolled tenants; recommended for all clients. Persist it with the lead/claim operation and reuse it with the identical session and body on timeouts/retries. Do not generate a new key on each retry. Wallet receipt replays return the original success without a new debit, even after unclaim; they do not re-evaluate gates or prove current claim status. Changed session/body with a used key returns 409 `idempotency_conflict`. Legacy claims do not provide wallet receipt replay semantics; do not assume the header alone makes legacy retries idempotent.

- 400: malformed parameters or `idempotency_key_required`; fix request.
- 401/403: authentication/scope or account limits; do not accept as verified.
- 402: wallet balance, spend limit or payment-review restriction; not a lead-quality rejection.
- 404 on claim/status: session missing.
- 409: inspect `error`: gate failure, `already_claimed`, same-tenant `Session already claimed`, or idempotency/state conflict. An error mentioning "claimed" is not success.
- 429: honor retry guidance. Lookup, claim-status, proof and quality share per-tenant search limits: 60/minute, 10,000/day, 100,000/month.
- 5xx/timeouts: unresolved outcome, not success. Retry the same wallet request/key within your bounded retry policy; never loosen gates to make a retry pass.

## QA acceptance cases

Use an explicitly selected test environment/account and fresh controlled sessions. Check a valid lead; missing proof; no recording; wrong/no vertical; verified/quality scores below threshold; PII match/mismatch/omitted fields; exclusive already claimed; same-tenant duplicate; identical wallet retry; changed-body key conflict; 401/402/429 and timeout handling. For each rejection confirm the router does not accept. For wallet retry confirm one claim/debit and the same receipt. Verify actual request headers/body and response JSON paths, not just the router's labels. Do not call claim on Ping and again on Post as independent purchases. Thresholds and match policy are buyer decisions.

## Optional MCP tools

Direct REST is sufficient; installing MCP is not required to build an integration. Inspect `tools/list` on your installed server before relying on capabilities. Updated source exposes `verfi_claim_session` gates and `idempotencyKey` plus `verfi_get_claim_status`; older published packages may not. Until the updated npm release is installed, use REST or build this repository's source and run `node /absolute/path/dist/index.js`. `verfi_search_session` performs PII lookup. `verfi_verify_consent` summarizes proof fields; it is not a claim, a combined PII acceptance decision, or a guarantee of legal compliance.

## Other session operations

- `GET /sessions`: lists the authenticated tenant's claims. `page` defaults to 1, `limit` to 20 (maximum 100); `status=unclaimed` selects released claims, otherwise active claims. Response `data.sessions` separates session `status` from `claimStatus`; pagination is under `data.pagination`.
- `GET /sessions/{verfiID}/proof`: requires `sessions:proof`; machine-readable evidence under `data`. See [proof schema](https://github.com/Verfi-io/verfi-mcp-server/blob/main/plugin/skills/verfi/references/proof-schema.md). Proof flags are evidence summaries, not the buyer's complete acceptance policy.
- `POST /sessions/{verfiID}/unclaim`: requires `sessions:unclaim`; releases only this tenant's claim. Other active claims can continue retention. Unclaim is not an automatic refund or an audit clean-up step.
- `PUT /sessions/{verfiID}/expiration`: requires `sessions:expiration`; body `expirationDate` is ISO datetime, at least 30 days from now and within five years of claim. Limits: three updates/month/session and 24-hour cooldown. See the OpenAPI spec for response/error schemas.
