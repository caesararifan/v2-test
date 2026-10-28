'use strict';

/**
 * Sum of dataUsageMB over all records.
 *
 * Original (buggy):
 *   return records.reduce((total, record) => { total += record.dataUsageMB; });
 * Problems: no `return` inside the callback, and no initial value. See docs/Q4-explanation.md.
 */
function getTotalUsageMB(records) {
  if (!Array.isArray(records)) {
    throw new TypeError('records must be an array');
  }
  return records.reduce((total, record, index) => {
    const mb = record?.dataUsageMB;
    if (typeof mb !== 'number' || !Number.isFinite(mb)) {
      throw new TypeError(`records[${index}].dataUsageMB must be a finite number, got ${mb}`);
    }
    return total + mb;
  }, 0);
}

module.exports = { getTotalUsageMB };
