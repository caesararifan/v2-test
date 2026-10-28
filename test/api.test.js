'use strict';

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('../src/app');
const { UsageStore } = require('../src/store');

let server, base;
const store = new UsageStore();

before(async () => {
  server = createApp(store).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());
beforeEach(() => store.clear());

const post = (body, raw) =>
  fetch(`${base}/api/usage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  });

const valid = { subscriberId: 'SUB01', callMinutes: 40, smsCount: 10, dataUsageMB: 1500 };

test('POST creates a record and returns 201 with id + recordedAt', async () => {
  const res = await post(valid);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.id, /^[0-9a-f-]{36}$/);
  assert.equal(body.subscriberId, 'SUB01');
  assert.ok(!Number.isNaN(Date.parse(body.recordedAt)));
  assert.equal(res.headers.get('location'), `/api/usage/${body.id}`);
});

test('POST rejects invalid fields with 400 and per-field details', async () => {
  const res = await post({ subscriberId: '', callMinutes: -1, smsCount: 1.5, dataUsageMB: 'x' });
  assert.equal(res.status, 400);
  const { details } = await res.json();
  assert.deepEqual(details.map((d) => d.field).sort(), ['callMinutes', 'dataUsageMB', 'smsCount', 'subscriberId']);
});

test('POST rejects missing fields, non-object body and malformed JSON', async () => {
  assert.equal((await post({ subscriberId: 'SUB01' })).status, 400);
  assert.equal((await post([1, 2])).status, 400);
  assert.equal((await post(null, '{bad json')).status, 400);
});

test('POST accepts zero values and decimal MB', async () => {
  const res = await post({ ...valid, callMinutes: 0, smsCount: 0, dataUsageMB: 12.5 });
  assert.equal(res.status, 201);
});

test('GET /api/usage lists, filters by subscriberId and paginates', async () => {
  for (const id of ['SUB01', 'SUB01', 'SUB02']) await post({ ...valid, subscriberId: id });
  let body = await (await fetch(`${base}/api/usage`)).json();
  assert.equal(body.total, 3);
  body = await (await fetch(`${base}/api/usage?subscriberId=SUB01`)).json();
  assert.equal(body.total, 2);
  body = await (await fetch(`${base}/api/usage?limit=1&offset=2`)).json();
  assert.equal(body.items.length, 1);
  assert.equal(body.total, 3);
});

test('GET /api/usage validates query params', async () => {
  assert.equal((await fetch(`${base}/api/usage?limit=0`)).status, 400);
  assert.equal((await fetch(`${base}/api/usage?limit=5000`)).status, 400);
  assert.equal((await fetch(`${base}/api/usage?from=not-a-date`)).status, 400);
});

test('GET /api/usage supports from/to range', async () => {
  await post(valid);
  const future = new Date(Date.now() + 3600_000).toISOString();
  assert.equal((await (await fetch(`${base}/api/usage?from=${future}`)).json()).total, 0);
  assert.equal((await (await fetch(`${base}/api/usage?to=${future}`)).json()).total, 1);
});

test('GET /api/usage/:id returns the record or 404', async () => {
  const created = await (await post(valid)).json();
  const res = await fetch(`${base}/api/usage/${created.id}`);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), created);
  assert.equal((await fetch(`${base}/api/usage/nope`)).status, 404);
});

test('GET /api/subscribers/:id/usage returns totals', async () => {
  await post(valid);
  await post({ ...valid, callMinutes: 35, smsCount: 8, dataUsageMB: 1200 });
  const body = await (await fetch(`${base}/api/subscribers/SUB01/usage`)).json();
  assert.deepEqual(body.totals, { recordCount: 2, callMinutes: 75, smsCount: 18, dataUsageMB: 2700 });
  assert.equal(body.records.length, 2);
  assert.equal((await fetch(`${base}/api/subscribers/NOPE/usage`)).status, 404);
});
