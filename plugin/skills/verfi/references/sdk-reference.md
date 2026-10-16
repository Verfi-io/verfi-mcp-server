# Verfi SDK reference

Use the current SDK installation and field configuration at https://verfi.io/docs/integration-guide.

```html
<script async src="https://sdk.verfi.io/v2/index.js?field=verfiProof&apiKey=YOUR_PUBLIC_KEY&verticals=auto_insurance&claimMode=multi"></script>
```

Configuration is in URL query parameters, not a data-key attribute. `field` names the injected proof-URL form field. Pass its populated value with the lead; do not assume a `verfi-id` hidden field or a session-created browser event. Missing proof is not success. Verify the field reaches the router on a fresh interactive test submission.

`verticals` declares the lander's intent. `claimMode` is `multi` (default) or `exclusive`. Both are fixed when the session is created. They are not buyer request settings. Never put an sk_ secret in the SDK tag.

PII hashing uses SHA-256 of the captured string without email/phone normalization. Verify the actual capture field mapping and match it to the buyer's values before enabling required matches. For buyer gates, hashes, scopes and QA cases, read [api-reference.md](api-reference.md).
