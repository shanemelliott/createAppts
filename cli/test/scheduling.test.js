import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromIso } from '../src/dates.js';
import {
  buildAppaddParams, buildAppdelParams, buildArcloseParams, buildArsetParams, buildCancelAvailabilityParams,
  candidateSlots, decodeOpenCount, parseAppSlots, parseAppaddResponse, parseAppdelResponse, parseArcloseResponse,
  parseArsetResponse, parseCancelAvailabilityResponse, parseSdecRows
} from '../src/vista/scheduling.js';

const RS = '\u001e';
const US = '\u001f';
const day = fromIso('2027-02-15');

test('ARSET parameters pin the pieces scenarios rely on', () => {
  const p = buildArsetParams({
    dfn: '100', requestDateTime: '11/17/2026@10:00', institution: 'CAMP MASTER', clinicIen: '532', duz: '520',
    desiredDay: fromIso('2026-09-18'), comment: 'appt-scenario osm'
  });
  assert.equal(p.length, 29);
  assert.equal(p[0], ''); // new request
  assert.equal(p[1], '100');
  assert.equal(p[2], '11/17/2026@10:00');
  assert.equal(p[3], 'CAMP MASTER');
  assert.equal(p[4], 'APPT');
  assert.equal(p[5], '532');
  assert.equal(p[6], '520');
  assert.equal(p[8], 'PATIENT');
  assert.equal(p[10], '9/18/2026'); // desired date (INP 11)
  assert.equal(p[12], 'GROUP 1'); // enrollment priority (INP 13)
  assert.equal(p[13], 'NO'); // multiple appointment RTC (INP 14)
  assert.equal(p[21], '11'); // appointment type (INP 22)
  assert.equal(p[24], ''); // parent request (INP 25)
});

test('APPADD parameters link the request, never overbook, and leave parent empty', () => {
  const p = buildAppaddParams({
    slot: { day, start: '0830', end: '0900', duration: 30 }, dfn: '100', resourceIen: '1532', clinicIen: '532',
    desiredDay: fromIso('2026-11-17'), requestIen: '9001'
  });
  assert.equal(p.length, 25);
  assert.equal(p[0], 'FEB 15, 2027@08:30');
  assert.equal(p[1], 'FEB 15, 2027@09:00');
  assert.equal(p[2], '100');
  assert.equal(p[3], '1532');
  assert.equal(p[4], '30');
  assert.equal(p[9], '11/17/2026');
  assert.equal(p[14], 'A|9001');
  assert.equal(p[17], '532');
  assert.equal(p[22], '0');
  assert.equal(p[23], '');
});

test('cleanup parameters', () => {
  assert.deepEqual(buildAppdelParams('7001', '520'), ['7001', 'C', '', 'appt-scenario cleanup', '', '520', '', '2']);
  assert.deepEqual(buildArcloseParams('9001', '6', '520'), ['9001', '6', '520']);
});

test('cancel availability parameters mirror the legacy script with tz-aware offsets', () => {
  assert.deepEqual(
    buildCancelAvailabilityParams('478', fromIso('2026-11-17'), 'America/New_York', 'testing'),
    ['478', 'F', '2026-11-17T00:00-05:00', '2026-11-17T21:00-05:00', 'testing']
  );
  assert.deepEqual(
    buildCancelAvailabilityParams('478', fromIso('2026-10-31'), 'America/New_York', 'testing').slice(2, 4),
    ['2026-10-31T00:00-04:00', '2026-10-31T21:00-04:00']
  );
});

test('buildAppdelParams keeps the clean-up defaults and takes cancel options', () => {
  assert.deepEqual(buildAppdelParams('65491', '520'), ['65491', 'C', '', 'appt-scenario cleanup', '', '520', '', '2']);
  assert.deepEqual(
    buildAppdelParams('65491', '520', { type: 'PC', reasonIen: '5', note: 'n', reopen: true }),
    ['65491', 'PC', '5', 'n', '', '520', '', '1']
  );
});

test('response parsers', () => {
  assert.equal(parseArsetResponse(`I00020ERRORID^T00030ERRORTEXT${RS}9001^${RS}${US}`), '9001');
  assert.throws(() => parseArsetResponse(`I00020ERRORID^T00030ERRORTEXT${RS}-1^Invalid Patient ID${RS}${US}`), /Invalid Patient ID/);
  assert.deepEqual(parseAppaddResponse(`I00020APPOINTMENTID^T00030ERRORID${RS}7001^${RS}${US}`), { ok: true, appointmentId: '7001' });
  assert.deepEqual(parseAppaddResponse(`I00020APPOINTMENTID^T00030ERRORID${RS}0^NO OPEN SLOTS${RS}${US}`), { ok: false, error: 'NO OPEN SLOTS' });
  assert.equal(parseAppdelResponse(`I00020ERRORID^T00030ERRORTEXT${RS}0^${RS}${US}`).ok, true);
  assert.equal(parseAppdelResponse(`I00020ERRORID^T00030ERRORTEXT${RS}-1^Already cancelled${RS}${US}`).ok, false);
  // Replies captured from dev: success has no row; an error is one row holding the message.
  assert.deepEqual(parseAppdelResponse(`T00020ERRORID${RS}${RS}${US}`), { ok: true });
  assert.deepEqual(parseAppdelResponse(`T00020ERRORID${RS}SDEC08: Invalid Appointment ID${RS}${US}`), { ok: false, error: 'SDEC08: Invalid Appointment ID' });
  assert.equal(parseArcloseResponse('9001').ok, true);
  assert.deepEqual(parseArcloseResponse('-1^Request already closed'), { ok: false, error: 'Request already closed' });
  assert.equal(parseCancelAvailabilityResponse('{"Success":true}').ok, true);
  assert.equal(parseCancelAvailabilityResponse('{"Error":["bad clinic"]}').error, 'bad clinic');
  assert.equal(parseCancelAvailabilityResponse('{"Errors":[]}').ok, true);
});

test('parseSdecRows strips the 6-char type prefix from headers', () => {
  const { rows } = parseSdecRows(`I00020RESOURCEID^T00030CLINNAME${RS}12^CARDIOLOGY${RS}${US}`);
  assert.equal(rows[0].RESOURCEID, '12');
  assert.equal(rows[0].CLINNAME, 'CARDIOLOGY');
});

test('APPSLOTS parsing and candidate generation', () => {
  const raw = `I00020DATE^I00020START^I00020END^T00030AVAILABILITY${RS}3270215^0800^0900^2${RS}3270215^0900^1000^0${RS}3270216^1300^1330^k${RS}${US}`;
  const blocks = parseAppSlots(raw);
  assert.equal(blocks.length, 3);
  assert.equal(decodeOpenCount('k'), 11);
  assert.equal(decodeOpenCount('A'), 0);
  const cands = candidateSlots(blocks, 30);
  assert.deepEqual(cands.map((c) => `${c.day.day} ${c.start}-${c.end}`), ['15 0800-0830', '15 0830-0900', '16 1300-1330']);
  const later = candidateSlots(blocks, 30, { notBefore: { day, hhmm: '0815' } });
  assert.equal(later[0].start, '0830');
});

test('15-minute APPSLOTS rows are merged to fit a 30-minute appointment (dev sample shape)', () => {
  const raw = 'T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY\u001e3261117^0700^0715^j\u001e3261117^0715^0730^j\u001e'
    + '3261117^0730^0745^0\u001e3261117^0745^0800^j\u001e3261117^0800^0815^j\u001e3261117^1500^1800^\u001e';
  const cands = candidateSlots(parseAppSlots(raw), 30);
  assert.deepEqual(cands.map((c) => `${c.start}-${c.end}`), ['0700-0730', '0745-0815']);
});
