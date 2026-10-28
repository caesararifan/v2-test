'use strict';

const { randomUUID } = require('node:crypto');

/** In-memory storage for usage records. Swap this class for a DB-backed one without touching the routes. */
class UsageStore {
  constructor() {
    this.records = [];
  }

  create({ subscriberId, callMinutes, smsCount, dataUsageMB }) {
    const record = {
      id: randomUUID(),
      subscriberId,
      callMinutes,
      smsCount,
      dataUsageMB,
      recordedAt: new Date().toISOString(),
    };
    this.records.push(record);
    return record;
  }

  get(id) {
    return this.records.find((r) => r.id === id) || null;
  }

  /** Filter by subscriberId and recordedAt range [from, to], oldest first, then paginate. */
  list({ subscriberId, from, to, limit, offset } = {}) {
    let items = this.records;
    if (subscriberId) items = items.filter((r) => r.subscriberId === subscriberId);
    if (from) items = items.filter((r) => new Date(r.recordedAt) >= from);
    if (to) items = items.filter((r) => new Date(r.recordedAt) <= to);
    const total = items.length;
    const start = offset || 0;
    const page = limit === undefined ? items.slice(start) : items.slice(start, start + limit);
    return { total, items: page };
  }

  totalsFor(subscriberId) {
    const items = this.records.filter((r) => r.subscriberId === subscriberId);
    return items.reduce(
      (acc, r) => ({
        recordCount: acc.recordCount + 1,
        callMinutes: acc.callMinutes + r.callMinutes,
        smsCount: acc.smsCount + r.smsCount,
        dataUsageMB: acc.dataUsageMB + r.dataUsageMB,
      }),
      { recordCount: 0, callMinutes: 0, smsCount: 0, dataUsageMB: 0 }
    );
  }

  clear() {
    this.records = [];
  }
}

module.exports = { UsageStore };
