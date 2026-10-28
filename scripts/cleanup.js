#!/usr/bin/env node
'use strict';

/**
 * Removes CSV snapshots older than RETENTION_DAYS (default 30).
 * Age is taken from the timestamp in the file name (not file mtime, which changes on copy/restore).
 * Only files matching usage_snapshot_YYYYMMDD_HHmm_WIB.csv are ever touched.
 *
 *   node scripts/cleanup.js            # delete
 *   node scripts/cleanup.js --dry-run  # only list what would be deleted
 */

const fs = require('node:fs/promises');
const path = require('node:path');
const { parseSnapshotFileName, log } = require('./lib');

const DAY_MS = 24 * 60 * 60 * 1000;

async function cleanup({ dir, retentionDays, now = new Date(), dryRun = false }) {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === 'ENOENT') return { deleted: [], kept: 0, skipped: 0 };
    throw err;
  }

  const deleted = [];
  let kept = 0;
  let skipped = 0;
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    const instant = parseSnapshotFileName(entry.name);
    if (!instant) { skipped += 1; continue; } // not one of our snapshots - never touch it
    if (instant < cutoff) {
      if (!dryRun) await fs.unlink(path.join(dir, entry.name));
      deleted.push(entry.name);
    } else {
      kept += 1;
    }
  }
  return { deleted, kept, skipped };
}

async function main() {
  const dir = path.resolve(process.env.SNAPSHOT_DIR || path.join(__dirname, '..', 'snapshots'));
  const retentionDays = Number(process.env.RETENTION_DAYS || 30);
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) {
    throw new Error(`Invalid RETENTION_DAYS: ${process.env.RETENTION_DAYS}`);
  }
  const dryRun = process.argv.includes('--dry-run');
  const { deleted, kept, skipped } = await cleanup({ dir, retentionDays, dryRun });
  for (const f of deleted) log('INFO', `${dryRun ? 'Would delete' : 'Deleted'} ${f}`);
  log('INFO', `Done. ${dryRun ? 'would delete' : 'deleted'}=${deleted.length} kept=${kept} ignored=${skipped} dir=${dir}`);
}

if (require.main === module) {
  main().catch((err) => {
    log('ERROR', `Cleanup failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { cleanup };
