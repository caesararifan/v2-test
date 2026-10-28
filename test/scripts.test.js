'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { snapshotFileName, parseSnapshotFileName, buildCsv } = require('../scripts/lib');
const { cleanup } = require('../scripts/cleanup');
const { getTotalUsageMB } = require('../q4/getTotalUsageMB');

test('snapshot file name uses WIB wall-clock time', () => {
  // 01:00 UTC on 2025-08-01 is 08:00 WIB the same day
  assert.equal(snapshotFileName(new Date('2025-08-01T01:00:00Z')), 'usage_snapshot_20250801_0800_WIB.csv');
  // 18:30 UTC rolls over to the next WIB day
  assert.equal(snapshotFileName(new Date('2025-08-01T18:30:00Z')), 'usage_snapshot_20250802_0130_WIB.csv');
});

test('parseSnapshotFileName round-trips and rejects foreign/invalid names', () => {
  const d = new Date('2025-08-01T08:00:00Z'); // 15:00 WIB
  assert.equal(parseSnapshotFileName(snapshotFileName(d)).toISOString(), d.toISOString());
  assert.equal(parseSnapshotFileName('notes.csv'), null);
  assert.equal(parseSnapshotFileName('usage_snapshot_20250231_0800_WIB.csv'), null);
});

test('buildCsv writes header, rows and escapes special characters', () => {
  const csv = buildCsv([{ id: '1', subscriberId: 'a,b', callMinutes: 1, smsCount: 2, dataUsageMB: 3.5, recordedAt: 'x"y' }]);
  assert.equal(csv.split('\n')[0], 'id,subscriberId,callMinutes,smsCount,dataUsageMB,recordedAt');
  assert.equal(csv.split('\n')[1], '1,"a,b",1,2,3.5,"x""y"');
  assert.equal(buildCsv([]), 'id,subscriberId,callMinutes,smsCount,dataUsageMB,recordedAt\n');
});

test('cleanup deletes only snapshots older than retention and ignores other files', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'snap-'));
  const now = new Date('2025-09-01T00:00:00Z');
  const files = {
    'usage_snapshot_20250701_0800_WIB.csv': true,  // 62 days old -> delete
    'usage_snapshot_20250801_0800_WIB.csv': true,  // 30d 17h old -> delete
    'usage_snapshot_20250803_0800_WIB.csv': false, // < 30 days -> keep
    'usage_snapshot_20250831_1500_WIB.csv': false, // recent -> keep
    'README.txt': false,                            // foreign file -> never touched
    'usage_snapshot_20250101_0800_WIB.csv.tmp': false, // not a finished snapshot -> ignored
  };
  for (const f of Object.keys(files)) await fs.writeFile(path.join(dir, f), 'x');

  const dry = await cleanup({ dir, retentionDays: 30, now, dryRun: true });
  assert.equal(dry.deleted.length, 2);
  assert.equal((await fs.readdir(dir)).length, 6); // dry run deletes nothing

  await cleanup({ dir, retentionDays: 30, now });
  const left = await fs.readdir(dir);
  for (const [f, shouldDelete] of Object.entries(files)) assert.equal(!left.includes(f), shouldDelete, f);
  await fs.rm(dir, { recursive: true });
});

test('cleanup on a missing directory is a no-op', async () => {
  const res = await cleanup({ dir: path.join(os.tmpdir(), 'does-not-exist-xyz'), retentionDays: 30 });
  assert.deepEqual(res.deleted, []);
});

test('Q4: getTotalUsageMB sums correctly and handles edge cases', () => {
  const rec = (n) => ({ dataUsageMB: n });
  assert.equal(getTotalUsageMB([rec(1500), rec(1200), rec(500)]), 3200);
  assert.equal(getTotalUsageMB([rec(42)]), 42);   // original returned the object itself
  assert.equal(getTotalUsageMB([]), 0);           // original threw TypeError
  assert.equal(getTotalUsageMB([rec(0.5), rec(0.25)]), 0.75);
  assert.throws(() => getTotalUsageMB([rec(1), { dataUsageMB: '5' }]), TypeError);
  assert.throws(() => getTotalUsageMB([rec(1), null]), TypeError);
  assert.throws(() => getTotalUsageMB(undefined), TypeError);
});
