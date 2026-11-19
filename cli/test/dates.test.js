import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  addDays, daysBetween, fromFileman, fromIso, parseVistaDate, parseVistaDateTime, parseVistaTime, requestDateTime, toIso, toMdy, todayIn, utcOffset, vistaDateTime
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


test('parseVistaDate accepts slash, T, T+N, T-N and ISO forms', () => {
  const today = fromIso('2026-11-19');
  assert.equal(toIso(parseVistaDate('1/1/2027', today)), '2027-01-01');
  assert.equal(toIso(parseVistaDate('01/04/27', today)), '2027-01-04');
  assert.equal(toIso(parseVistaDate('T', today)), '2026-11-19');
  assert.equal(toIso(parseVistaDate('t', today)), '2026-11-19');
  assert.equal(toIso(parseVistaDate('T+1', today)), '2026-11-20');
  assert.equal(toIso(parseVistaDate('T+30', today)), '2026-12-19');
  assert.equal(toIso(parseVistaDate('T-1', today)), '2026-11-18');
  assert.equal(toIso(parseVistaDate(' 2027-01-01 ', today)), '2027-01-01');
});

test('parseVistaDate rejects bad and impossible dates', () => {
  const today = fromIso('2026-11-19');
  for (const bad of ['', '2/30/2027', '13/1/2027', '0/5/2027', '1/32/2027', '2027-02-30', 'T+', 'T+x', 'TODAY', 'JAN 1 2027', '1/1', '1/1/202']) {
    assert.throws(() => parseVistaDate(bad, today), /Invalid date/, bad);
  }
});

test('T resolves in the site timezone even when the host date differs', () => {
  const now = new Date('2026-11-18T03:30:00Z'); // Nov 17 in New York, Nov 18 in UTC
  assert.equal(toIso(parseVistaDate('T', todayIn(NY, now))), '2026-11-17');
  assert.equal(toIso(parseVistaDate('T+1', todayIn(NY, now))), '2026-11-18');
  assert.equal(toIso(parseVistaDate('T', todayIn('UTC', now))), '2026-11-18');
});

test('parseVistaTime handles 24-hour and AM/PM', () => {
  assert.equal(parseVistaTime('9:30'), '0930');
  assert.equal(parseVistaTime('09:30'), '0930');
  assert.equal(parseVistaTime('14:00'), '1400');
  assert.equal(parseVistaTime('0:05'), '0005');
  assert.equal(parseVistaTime('2:30 PM'), '1430');
  assert.equal(parseVistaTime('2:30pm'), '1430');
  assert.equal(parseVistaTime('12:00 AM'), '0000');
  assert.equal(parseVistaTime('12:15 PM'), '1215');
  assert.equal(parseVistaTime('9:30 am'), '0930');
});

test('parseVistaTime rejects impossible times', () => {
  for (const bad of ['', '25:00', '24:00', '9:60', '9', '930', '13:00 PM', '0:30 AM', 'noon']) {
    assert.throws(() => parseVistaTime(bad), /Invalid time/, bad);
  }
});

test('parseVistaDateTime needs both a date and a time', () => {
  const today = fromIso('2026-11-19');
  assert.deepEqual(parseVistaDateTime('1/1/2027@9:30', today), { day: { year: 2027, month: 1, day: 1 }, hhmm: '0930' });
  assert.deepEqual(parseVistaDateTime('T@9:30', today), { day: { year: 2026, month: 11, day: 19 }, hhmm: '0930' });
  assert.deepEqual(parseVistaDateTime('T+1@14:00', today), { day: { year: 2026, month: 11, day: 20 }, hhmm: '1400' });
  assert.deepEqual(parseVistaDateTime('1/4/2027@2:30 PM', today), { day: { year: 2027, month: 1, day: 4 }, hhmm: '1430' });
  assert.deepEqual(parseVistaDateTime('2027-01-01@09:30', today), { day: { year: 2027, month: 1, day: 1 }, hhmm: '0930' });
  assert.deepEqual(parseVistaDateTime(' T+1 @ 9:30 ', today), { day: { year: 2026, month: 11, day: 20 }, hhmm: '0930' });
  for (const bad of ['', '1/1/2027', '@9:30', '1/1/2027@', 'T', '2/30/2027@9:30', '1/1/2027@25:00']) {
    assert.throws(() => parseVistaDateTime(bad, today), Error, bad);
  }
});
