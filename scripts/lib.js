'use strict';

const TZ = 'Asia/Jakarta';
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000; // WIB = UTC+7, no DST
const FILE_PREFIX = 'usage_snapshot_';
const FILE_RE = /^usage_snapshot_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})_WIB\.csv$/;
const CSV_COLUMNS = ['id', 'subscriberId', 'callMinutes', 'smsCount', 'dataUsageMB', 'recordedAt'];

/** Format a Date as WIB parts. */
function wibParts(date) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  return { y: get('year'), mo: get('month'), d: get('day'), h: get('hour'), mi: get('minute') };
}

/** usage_snapshot_YYYYMMDD_HHmm_WIB.csv  (timestamp is the WIB wall-clock time of the run) */
function snapshotFileName(date = new Date()) {
  const { y, mo, d, h, mi } = wibParts(date);
  return `${FILE_PREFIX}${y}${mo}${d}_${h}${mi}_WIB.csv`;
}

/** Parse a snapshot file name back to the exact instant (UTC Date). Returns null if the name does not match. */
function parseSnapshotFileName(name) {
  const m = FILE_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi] = m.map(Number);
  const instant = new Date(Date.UTC(y, mo - 1, d, h, mi) - WIB_OFFSET_MS);
  // Reject impossible dates such as 20250231 (Date.UTC would silently roll over)
  const back = wibParts(instant);
  if (Number(back.y) !== y || Number(back.mo) !== mo || Number(back.d) !== d) return null;
  return instant;
}

function csvEscape(value) {
  const s = String(value ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildCsv(records) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of records) lines.push(CSV_COLUMNS.map((c) => csvEscape(r[c])).join(','));
  return lines.join('\n') + '\n';
}

function log(level, msg) {
  console.log(`${new Date().toISOString()} [${level}] ${msg}`);
}

module.exports = { snapshotFileName, parseSnapshotFileName, buildCsv, csvEscape, log, CSV_COLUMNS };
