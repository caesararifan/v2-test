# Subscriber Usage – Technical Test

Backend API for recording/retrieving subscriber usage (Q1), cron-based CSV snapshots + cleanup (Q2), SQL answers (Q3) and the bug write-up (Q4).

| Item | Location |
|---|---|
| Q1 API | `src/` (+ small web UI in `public/`) |
| Q2 snapshot + cleanup | `scripts/snapshot.js`, `scripts/cleanup.js`, `scripts/crontab.example` |
| Q3 SQL | `sql/schema.sql`, `sql/queries.sql` |
| Q4 fix + explanation | `q4/getTotalUsageMB.js`, `docs/Q4-explanation.md` |
| Tests | `test/` |

## Requirements

- Node.js **18+** (developed/tested on Node 22) and npm
- A cron daemon on the machine that runs the snapshots (Linux/macOS)

## Setup

```bash
npm install
cp .env.example .env   # optional – every variable has a default (see Configuration)
npm start              # API on http://localhost:3000
npm test               # 15 automated tests
```

Open http://localhost:3000 for the simple UI (record usage form + table with filter).

## Configuration

Environment variables (see `.env.example`; the app does not load `.env` by itself – export the variables or set them in the crontab/service):

| Variable | Default | Used by | Meaning |
|---|---|---|---|
| `PORT` | `3000` | API | HTTP port |
| `API_BASE_URL` | `http://localhost:3000` | snapshot | Where the API is reachable |
| `SNAPSHOT_DIR` | `./snapshots` | snapshot, cleanup | Where CSV files are written / pruned |
| `RETENTION_DAYS` | `30` | cleanup | Snapshots older than this are deleted |

---

## Q1 – API documentation

Storage is **in memory** (`src/store.js`): data is lost when the server restarts. Responses are JSON. `recordedAt` is set by the server (ISO-8601, UTC).

A usage record:

| Field | Type | Rules |
|---|---|---|
| `id` | string (UUID) | server generated |
| `subscriberId` | string | required, 1–32 chars: letters, digits, `_`, `-`; must start with a letter/digit |
| `callMinutes` | integer | required, ≥ 0 |
| `smsCount` | integer | required, ≥ 0 |
| `dataUsageMB` | number | required, ≥ 0 (decimals allowed) |
| `recordedAt` | string | server generated |

### Endpoints

| Method | Path | Description | Success |
|---|---|---|---|
| `POST` | `/api/usage` | Record a usage entry | `201` + record, `Location` header |
| `GET` | `/api/usage` | List records (filters + pagination) | `200` |
| `GET` | `/api/usage/:id` | Get one record | `200` / `404` |
| `GET` | `/api/subscribers/:subscriberId/usage` | All records of a subscriber + totals | `200` / `404` |
| `GET` | `/health` | Liveness check | `200` |

**`GET /api/usage` query params:** `subscriberId`, `from`, `to` (ISO-8601, filters on `recordedAt`, inclusive), `limit` (1–1000, default 100), `offset` (default 0). Records are returned oldest first.

### Examples

```bash
# Create
curl -X POST http://localhost:3000/api/usage \
  -H 'Content-Type: application/json' \
  -d '{"subscriberId":"SUB01","callMinutes":40,"smsCount":10,"dataUsageMB":1500}'
```
```json
{
  "id": "da21b448-ae67-41af-a565-24e2c1450ec2",
  "subscriberId": "SUB01",
  "callMinutes": 40,
  "smsCount": 10,
  "dataUsageMB": 1500,
  "recordedAt": "2025-08-01T01:00:00.000Z"
}
```

```bash
# List (paginated)
curl 'http://localhost:3000/api/usage?subscriberId=SUB01&limit=50&offset=0'
```
```json
{ "total": 1, "limit": 50, "offset": 0, "items": [ { "id": "…", "subscriberId": "SUB01", "…": "…" } ] }
```

```bash
# Per-subscriber view with totals
curl http://localhost:3000/api/subscribers/SUB01/usage
```
```json
{
  "subscriberId": "SUB01",
  "totals": { "recordCount": 2, "callMinutes": 75, "smsCount": 18, "dataUsageMB": 2700 },
  "records": [ { "…": "…" }, { "…": "…" } ]
}
```

### Errors

| Status | When | Body |
|---|---|---|
| `400` | Validation failed / malformed JSON / bad query param | `{"error":"ValidationError","details":[{"field":"callMinutes","message":"Must be a non-negative integer"}]}` |
| `404` | Unknown id, unknown subscriber, unknown `/api/*` route | `{"error":"NotFound","message":"…"}` |
| `413` | Body larger than 10 KB | `{"error":"PayloadTooLarge",…}` |
| `500` | Unexpected error | `{"error":"InternalServerError",…}` |

### Design notes

- `POST` returns `201` with a `Location` header; invalid input returns all field errors at once.
- The store is a small class so it can be swapped for a real database without touching the routes.
- Pagination is capped at 1000 rows so one request can't dump an unbounded list.

---

## Q2 – Snapshot automation

### What the scripts do

- **`scripts/snapshot.js`** – calls `GET /api/usage` (paging through *all* records) and writes a CSV. The write is atomic (temp file + rename). Exit code is `1` on failure so cron/monitoring can detect it. An empty dataset produces a header-only CSV.
- **`scripts/cleanup.js`** – deletes snapshots older than `RETENTION_DAYS` (30). `--dry-run` only lists what would be deleted.

The API must be running when the snapshot executes, because storage is in memory.

### File naming convention

```
usage_snapshot_YYYYMMDD_HHmm_WIB.csv        e.g.  usage_snapshot_20250801_0800_WIB.csv
```

- The timestamp is the **WIB (Asia/Jakarta, UTC+7)** wall-clock time of the run, so it matches the 08:00 / 12:00 / 15:00 schedule at a glance.
- It sorts alphabetically = chronologically, and each of the 3 daily runs has a unique name.
- The cleanup script derives age **from this timestamp, not from file modification time** (mtime changes on copy/restore/backup), and **only deletes files matching this exact pattern**, so unrelated files in the folder are never touched.

CSV columns: `id,subscriberId,callMinutes,smsCount,dataUsageMB,recordedAt`.

### Install the cron jobs

1. Edit the paths in `scripts/crontab.example` (project dir and `node` path from `which node`).
2. `mkdir -p logs` in the project directory.
3. `crontab scripts/crontab.example`

```cron
CRON_TZ=Asia/Jakarta
0 8,12,15 * * *  cd /opt/usage-api && /usr/bin/node scripts/snapshot.js >> logs/snapshot.log 2>&1
0 1 * * *        cd /opt/usage-api && /usr/bin/node scripts/cleanup.js  >> logs/cleanup.log  2>&1
```

**Timezone note:** `CRON_TZ` is not supported by every cron implementation. If yours ignores it (e.g. Debian/Ubuntu cron), use the UTC equivalents on a UTC server – WIB has no DST so the offset is constant: `0 1,5,8 * * *` for snapshots and `0 18 * * *` for cleanup (both variants are in `crontab.example`). Check with `date` and `crontab -l`.

### Run manually

```bash
npm run snapshot                       # one snapshot now
npm run cleanup -- --dry-run           # preview deletions
npm run cleanup                        # delete snapshots > 30 days old
```

---

## Q3 – SQL

Files: `sql/schema.sql` (tables + the sample data from the test) and `sql/queries.sql` (the 5 answers). PostgreSQL-compatible syntax; also verified on SQLite. Column names are snake_case (`subscriber_id`, `data_usage_mb`, …) and the `ID` of the new subscriber is `SUB07`, the next free value.

```sql
-- 1. Insert Fajar
INSERT INTO subscribers (id, name, plan, activation_date)
VALUES ('SUB07', 'Fajar', 'Basic', '2024-01-24');

-- 2. Upgrade to Premium
UPDATE subscribers SET plan = 'Premium' WHERE id = 'SUB07';

-- 3. Total data usage of all Premium subscribers
SELECT COALESCE(SUM(u.data_usage_mb), 0) AS total_data_usage_mb
FROM subscribers s JOIN usage u ON u.subscriber_id = s.id
WHERE s.plan = 'Premium';

-- 4. Top 3 subscribers by total data usage
SELECT s.id, s.name, SUM(u.data_usage_mb) AS total_data_usage_mb
FROM subscribers s JOIN usage u ON u.subscriber_id = s.id
GROUP BY s.id, s.name
ORDER BY total_data_usage_mb DESC, s.id ASC
LIMIT 3;

-- 5. Subquery: average call minutes per snapshot <= 30
SELECT s.id, s.name, s.plan
FROM subscribers s
WHERE s.id IN (SELECT u.subscriber_id FROM usage u
               GROUP BY u.subscriber_id HAVING AVG(u.call_minutes) <= 30)
ORDER BY s.id;
```

Results on the sample data:

| Query | Result |
|---|---|
| 3 | `16800` (SUB02 11800 + SUB05 5000; Fajar has no usage rows) |
| 4 | SUB02 Sari 11800 · SUB04 Dewi 9000 · SUB05 Rian 5000 |
| 5 | SUB03 Budi (avg 20) · SUB06 Nia (avg 25) |

Notes: the update targets the primary key rather than the name (names are not unique); query 5 uses `IN` with a grouped subquery, and subscribers with no usage rows are not returned since they have no average to evaluate. To try them locally: `sqlite3 :memory: < sql/schema.sql` then run the statements, or load both files into PostgreSQL.

---

## Q4 – Troubleshoot & explain

Full write-up (root cause, fix, prevention): [`docs/Q4-explanation.md`](docs/Q4-explanation.md). Fixed function: [`q4/getTotalUsageMB.js`](q4/getTotalUsageMB.js).

Short version: the `reduce` callback never **returned** the accumulator (so `total` became `undefined`/`NaN`) and no **initial value** was passed (so the first `total` was the first record object, and empty arrays threw). Fix: `return total + record.dataUsageMB` and `reduce(fn, 0)`; prevent with ESLint `array-callback-return`, TypeScript, edge-case tests and CI.

---

## Project layout

```
src/            app.js (routes) · store.js (in-memory storage) · validate.js · server.js
public/         index.html (simple UI)
scripts/        snapshot.js · cleanup.js · lib.js · crontab.example
sql/            schema.sql · queries.sql
q4/             getTotalUsageMB.js
docs/           Q4-explanation.md
test/           api.test.js · scripts.test.js
```
