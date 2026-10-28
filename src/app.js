'use strict';

const path = require('node:path');
const express = require('express');
const { UsageStore } = require('./store');
const { validateUsageInput, parseDateParam, parseIntParam } = require('./validate');

const MAX_LIMIT = 1000;
const DEFAULT_LIMIT = 100;

function createApp(store = new UsageStore()) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));

  // Create a usage record
  app.post('/api/usage', (req, res) => {
    const { errors, value } = validateUsageInput(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'ValidationError', details: errors });
    }
    const record = store.create(value);
    return res.status(201).location(`/api/usage/${record.id}`).json(record);
  });

  // List usage records (filter + pagination)
  app.get('/api/usage', (req, res) => {
    const from = parseDateParam(req.query.from);
    const to = parseDateParam(req.query.to);
    const limit = parseIntParam(req.query.limit, { def: DEFAULT_LIMIT, min: 1, max: MAX_LIMIT });
    const offset = parseIntParam(req.query.offset, { def: 0, min: 0, max: Number.MAX_SAFE_INTEGER });

    const bad = [];
    if (from === undefined) bad.push({ field: 'from', message: 'Must be an ISO-8601 date' });
    if (to === undefined) bad.push({ field: 'to', message: 'Must be an ISO-8601 date' });
    if (limit === undefined) bad.push({ field: 'limit', message: `Must be an integer between 1 and ${MAX_LIMIT}` });
    if (offset === undefined) bad.push({ field: 'offset', message: 'Must be a non-negative integer' });
    if (bad.length > 0) return res.status(400).json({ error: 'ValidationError', details: bad });

    const subscriberId = typeof req.query.subscriberId === 'string' ? req.query.subscriberId : undefined;
    const { total, items } = store.list({ subscriberId, from, to, limit, offset });
    return res.json({ total, limit, offset, items });
  });

  // Get one record
  app.get('/api/usage/:id', (req, res) => {
    const record = store.get(req.params.id);
    if (!record) return res.status(404).json({ error: 'NotFound', message: 'Usage record not found' });
    return res.json(record);
  });

  // All records + totals for one subscriber
  app.get('/api/subscribers/:subscriberId/usage', (req, res) => {
    const { subscriberId } = req.params;
    const { items } = store.list({ subscriberId });
    if (items.length === 0) {
      return res.status(404).json({ error: 'NotFound', message: `No usage recorded for ${subscriberId}` });
    }
    return res.json({ subscriberId, totals: store.totalsFor(subscriberId), records: items });
  });

  // 404 for unknown API routes
  app.use('/api', (_req, res) => res.status(404).json({ error: 'NotFound', message: 'Unknown endpoint' }));

  // Error handler (malformed JSON, payload too large, unexpected errors)
  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'BadRequest', message: 'Malformed JSON body' });
    }
    if (err.type === 'entity.too.large') {
      return res.status(413).json({ error: 'PayloadTooLarge', message: 'Request body too large' });
    }
    console.error(err);
    return res.status(500).json({ error: 'InternalServerError', message: 'Unexpected error' });
  });

  return app;
}

module.exports = { createApp };
