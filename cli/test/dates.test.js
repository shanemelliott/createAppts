import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, daysBetween, fromFileman, fromIso, requestDateTime, toIso, toMdy, todayIn, utcOffset, vistaDateTime
} from '../src/dates.js';

const NY = 'America/New_York';

test('today follows the site timezone, not the host clock', () => {
  // 03:30 UTC on Nov 18 is still Nov 17 in New York.
  assert.equal(toIso(todayIn(NY, new Date('2026-11-18T03:30:00Z'))), '2026-11-17');
  assert.equal(toIso(todayIn('UTC', new Date('2026-11-18T03:30:00Z'))), '2026-11-18');
  // 05:30 UTC is after New York midnight.
  assert.equal(toIso(todayIn(NY, new Date('2026-11-18T05:30:00Z'))), '2026-11-18');
});

test('addDays and daysBetween across month/year boundaries', () => {
  const d = fromIso('2026-11-17');
  assert.equal(toIso(addDays(d, 60)), '2027-01-16');
  assert.equal(toIso(addDays(d, -60)), '2026-09-18');
  assert.equal(toIso(addDays(d, 90)), '2027-02-15');
  assert.equal(daysBetween(d, addDays(d, 90)), 90);
});

test('VistA formats', () => {
  const d = fromIso('2027-02-05');
  assert.equal(toMdy(d), '2/5/2027');
  assert.equal(vistaDateTime(d, '0830'), 'FEB 05, 2027@08:30');
  assert.equal(requestDateTime(NY, new Date('2026-11-17T15:04:00Z')), '11/17/2026@10:04');
  assert.deepEqual(fromFileman('3261117'), { year: 2026, month: 11, day: 17 });
});

test('utcOffset tracks daylight saving time', () => {
  assert.equal(utcOffset(fromIso('2026-11-17'), '0000', NY), '-05:00');
  assert.equal(utcOffset(fromIso('2026-07-01'), '2100', NY), '-04:00');
  // DST ends 2026-11-01 at 02:00.
  assert.equal(utcOffset(fromIso('2026-10-31'), '2100', NY), '-04:00');
  assert.equal(utcOffset(fromIso('2026-11-01'), '2100', NY), '-05:00');
  assert.equal(utcOffset(fromIso('2026-11-17'), '0000', 'UTC'), '+00:00');
});

test('fromIso rejects malformed and impossible dates', () => {
  assert.throws(() => fromIso('11/17/2026'));
  assert.throws(() => fromIso('2026-02-30'));
});
