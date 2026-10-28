#!/usr/bin/env node
'use strict';

/**
 * Usage snapshot: pulls ALL current usage records from the API and writes them to
 *   <SNAPSHOT_DIR>/usage_snapshot_YYYYMMDD_HHmm_WIB.csv
 * Intended to be run by cron at 08:00, 12:00 and 15:00 WIB.
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { snapshotFileName, buildCsv, log } = require('./lib');

const PAGE_SIZE = 1000; // must be <= API max limit

async function fetchAllUsage(baseUrl) {
  const all = [];
  let offset = 0;
  for (;;) {
    const url = `${baseUrl}/api/usage?limit=${PAGE_SIZE}&offset=${offset}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`GET ${url} failed with HTTP ${res.status}`);
    const page = await res.json();
    all.push(...page.items);
    offset += page.items.length;
    if (page.items.length === 0 || offset >= page.total) break;
  }
  return all;
}

/** Write atomically: temp file first, then rename, so a crash never leaves a half-written snapshot. */
async function writeSnapshot(dir, fileName, csv) {
  await fs.mkdir(dir, { recursive: true });
  const finalPath = path.join(dir, fileName);
  const tmpPath = `${finalPath}.tmp`;
  await fs.writeFile(tmpPath, csv, 'utf8');
  await fs.rename(tmpPath, finalPath);
  return finalPath;
}

async function main() {
  const baseUrl = (process.env.API_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
  const dir = path.resolve(process.env.SNAPSHOT_DIR || path.join(__dirname, '..', 'snapshots'));

  const records = await fetchAllUsage(baseUrl);
  const file = await writeSnapshot(dir, snapshotFileName(new Date()), buildCsv(records));
  log('INFO', `Snapshot saved: ${file} (${records.length} records)`);
}

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', `Snapshot failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { fetchAllUsage, writeSnapshot };
