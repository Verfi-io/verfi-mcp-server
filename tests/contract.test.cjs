const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js');

test('compiled MCP preserves buyer gates, false/zero, hashes, idempotency and errors over HTTP', async () => {
  const requests = [];
  let status = 200;
  let payload = { success: true, data: { status: 'claimed', claimId: 'fixture' } };
  const api = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ method: req.method, url: req.url, headers: req.headers, body: body ? JSON.parse(body) : null });
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(payload));
  });
  await new Promise(resolve => api.listen(0, '127.0.0.1', resolve));
  const transport = new StdioClientTransport({ command: process.execPath, args: [path.resolve(__dirname, '../dist/index.js')], env: { ...process.env, VERFI_API_KEY: 'sk_fixture', VERFI_API_URL: `http://127.0.0.1:${api.address().port}/tenant/v1` }, stderr: 'pipe' });
  const client = new Client({ name: 'contract-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 9);
    assert.ok(tools.some(t => t.name === 'verfi_get_claim_status'));
    const args = { verfiID: 'VF-a1b2c3d4', idempotencyKey: 'fixture-operation-0001', requireRecording: true, requireVerticals: ['auto_insurance'], requireVerifiedScore: 0.2, minQualityScore: 50, requirePII: ['email', 'phone'], emailHash: 'a'.repeat(64), phoneHash: 'b'.repeat(64), requireClaimMode: 'exclusive' };
    const result = await client.callTool({ name: 'verfi_claim_session', arguments: args });
    assert.equal(result.isError, false);
    assert.deepEqual(JSON.parse(result.content[0].text), payload);
    assert.equal(requests[0].headers['idempotency-key'], args.idempotencyKey);
    assert.equal(requests[0].headers.authorization, 'Bearer sk_fixture');
    assert.equal(requests[0].url, '/tenant/v1/sessions/VF-a1b2c3d4/claim');
    assert.deepEqual(requests[0].body, { requireRecording: true, requireVerticals: ['auto_insurance'], requireVerifiedScore: 0.2, minQualityScore: 50, requirePII: ['email', 'phone'], emailHash: 'a'.repeat(64), phoneHash: 'b'.repeat(64), requireClaimMode: 'exclusive' });
    await client.callTool({ name: 'verfi_claim_session', arguments: args });
    assert.deepEqual(requests[1], requests[0]);
    await client.callTool({ name: 'verfi_claim_session', arguments: { verfiID: args.verfiID, requireRecording: false, requireVerifiedScore: 0, minQualityScore: 0 } });
    assert.deepEqual(requests[2].body, { requireRecording: false, requireVerifiedScore: 0, minQualityScore: 0 });
    const count = requests.length;
    for (const invalid of [{ requirePII: ['email'] }, { emailHash: 'a'.repeat(64) }, { requirePII: ['email', 'email'] }, { requirePII: ['phone'], phoneHash: 'bad' }, { requireClaimMode: 'invalid' }, { minQualityScore: 101 }, { requireVerifiedScore: -1 }, { requireRecording: 'true' }, { requireVerticals: [] }, { idempotencyKey: 'short' }]) {
      const rejected = await client.callTool({ name: 'verfi_claim_session', arguments: { verfiID: args.verfiID, ...invalid } });
      assert.equal(rejected.isError, true);
    }
    assert.equal(requests.length, count, 'invalid requests must not reach API');
    status = 409; payload = { error: 'no_recording' };
    const rejected = await client.callTool({ name: 'verfi_claim_session', arguments: args });
    assert.equal(rejected.isError, true);
    assert.deepEqual(JSON.parse(rejected.content[0].text), payload);
    status = 200; payload = { success: true, data: { claimMode: 'exclusive', claimable: false, hasValidRecording: true, recordingStatus: 'valid' } };
    const availability = await client.callTool({ name: 'verfi_get_claim_status', arguments: { verfiID: args.verfiID } });
    assert.deepEqual(JSON.parse(availability.content[0].text), payload);
    assert.equal(requests.at(-1).url, `/tenant/v1/sessions/${args.verfiID}/claim-status`);
    const hash = 'a'.repeat(64);
    await client.callTool({ name: 'verfi_search_session', arguments: { verfiID: args.verfiID, email: hash } });
    assert.equal(requests.at(-1).url, `/tenant/v1/sessions/${args.verfiID}?email=${hash}`);
    const sdk = await client.callTool({ name: 'verfi_add_sdk', arguments: { publicKey: 'pk_fixture' } });
    assert.match(JSON.parse(sdk.content[0].text).snippet, /v2\/index.js\?field=verfiProof&apiKey=pk_fixture&verticals=auto_insurance/);
  } finally {
    await client.close();
    await new Promise(resolve => api.close(resolve));
  }
});
