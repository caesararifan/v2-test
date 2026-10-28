'use strict';

const SUBSCRIBER_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/;

function isNonNegativeInteger(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

function isNonNegativeNumber(v) {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0;
}

/**
 * Validate the body of POST /api/usage.
 * Returns { errors: [{field, message}], value } - value is only set when errors is empty.
 */
function validateUsageInput(body) {
  const errors = [];
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { errors: [{ field: 'body', message: 'Request body must be a JSON object' }] };
  }

  const { subscriberId, callMinutes, smsCount, dataUsageMB } = body;

  if (typeof subscriberId !== 'string' || !SUBSCRIBER_ID_RE.test(subscriberId)) {
    errors.push({
      field: 'subscriberId',
      message: 'Must be a string of 1-32 chars (letters, digits, "_" or "-"), starting with a letter or digit',
    });
  }
  if (!isNonNegativeInteger(callMinutes)) {
    errors.push({ field: 'callMinutes', message: 'Must be a non-negative integer' });
  }
  if (!isNonNegativeInteger(smsCount)) {
    errors.push({ field: 'smsCount', message: 'Must be a non-negative integer' });
  }
  if (!isNonNegativeNumber(dataUsageMB)) {
    errors.push({ field: 'dataUsageMB', message: 'Must be a non-negative number' });
  }

  if (errors.length > 0) return { errors };
  return { errors, value: { subscriberId, callMinutes, smsCount, dataUsageMB } };
}

/** Parse an optional ISO-8601 date query parameter. Returns Date, null (absent) or undefined (invalid). */
function parseDateParam(raw) {
  if (raw === undefined || raw === '') return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Parse an optional integer query parameter within [min, max]. Returns number, default, or undefined (invalid). */
function parseIntParam(raw, { def, min, max }) {
  if (raw === undefined || raw === '') return def;
  if (!/^\d+$/.test(String(raw))) return undefined;
  const n = Number(raw);
  if (n < min || n > max) return undefined;
  return n;
}

module.exports = { validateUsageInput, parseDateParam, parseIntParam };
