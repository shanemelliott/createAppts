import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, test } from 'node:test';
import { main } from '../src/cli.js';
import { addMonths, fromIso, toIso } from '../src/dates.js';
import { buildApptsParams, normalizeAppointment, parseApptsReply } from '../src/queries/patientAppointments.js';
import { resolveSettings, validateSettings } from '../src/settings.js';
import { NOW, fakeVista, rawAppt } from '../testlib/fakeVista.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'appt-queries-'));
const emptyEnv = path.join(dir, 'empty.env');
writeFileSync(emptyEnv, '');
const creds = { VISTA_HOST: 'vista.example.com', VISTA_ACCESS_CODE: 'ac', VISTA_VERIFY_CODE: 'vc' };

function sink(isTTY) {
  let text = '';
  return { isTTY, write: (s) => { text += s; return true; }, get text() { return text; } };
}

async function run(argv, { env = creds, rpc = fakeVista(), envFile = emptyEnv, ...opts } = {}) {
  const stdout = sink(opts.tty);
  const stderr = sink();
  let connected = 0;
  const connect = async () => {
    connected += 1;
    return Object.assign(rpc, { user: { duz: '520', name: 'TESTER,ONE', division: 'CAMP MASTER' }, close: async () => {} });
  };
  const code = await main({
    argv: envFile ? [...argv, '--env-file', envFile] : argv,
    env,
    cwd: dir,
    stdout,
    stderr,
    stdin: { isTTY: opts.tty },
    connect,
    now: NOW,
    ...opts
  });
  return { code, stdout: stdout.text, stderr: stderr.text, connected, rpc };
}

const readNames = (rpc) => rpc.calls.map((c) => c.name);

// ---- patient appointments ----

const cancelledAppt = rawAppt({
  ien: 65457,
  at: '2026-11-18T07:00-0500',
  status: 'CANCELLED BY CLINIC',
  AppointmentCancelled: 'CANCELLED',
  CancelledByUser: { ID: 12345, Name: 'TESTER,ONE' },
  NoShowCancelledBy: 'TESTER,ONE'
});
const bookedAppt = rawAppt({ ien: 65491, at: '2026-11-18T14:15-0500' });
const laterAppt = rawAppt({ ien: 65500, at: '2027-01-16T08:00-0500', clinic: 'DEV PACT MD 4', status: 'NO-SHOW', SchedulerName: 'SCHED,ONE', DataEntryClerk: '' });

describe('patient appointments: parsing', () => {
  test('range parameters carry the offset for each date, across a DST change', () => {
    assert.deepEqual(
      buildApptsParams('100791', fromIso('2026-10-31'), fromIso('2026-11-02'), 'America/New_York'),
      ['100791', '2026-10-31T00:00-04:00', '2026-11-02T23:59-05:00']
    );
  });

  test('normalizes a real reply: cancelled by, status, clinic, site-time date', () => {
    const a = normalizeAppointment(cancelledAppt, 'America/New_York');
    assert.equal(a.ien, '65457');
    assert.equal(a.dateTime, '2026-11-18 07:00');
    assert.equal(a.clinicName, 'CARDIOLOGY');
    assert.equal(a.clinicIen, '195');
    assert.equal(a.status, 'CANCELLED BY CLINIC');
    assert.equal(a.scheduledBy, 'TESTER,ONE');
    assert.equal(a.cancelledBy, 'TESTER,ONE');
    assert.equal(a.requestIen, '42496');
    assert.equal(normalizeAppointment(bookedAppt, 'America/New_York').cancelledBy, '');
    assert.equal(normalizeAppointment(cancelledAppt, 'UTC').dateTime, '2026-11-18 12:00');
    assert.equal(normalizeAppointment(laterAppt, 'America/New_York').scheduledBy, 'SCHED,ONE');
  });

  test('sorts newest first and reads the patient name', () => {
    const body = `${JSON.stringify({ Appointment: [cancelledAppt, laterAppt, bookedAppt] })}\r\n`;
    const { appointments, patientName } = parseApptsReply(body, 'America/New_York');
    assert.deepEqual(appointments.map((a) => a.ien), ['65500', '65491', '65457']);
    assert.equal(patientName, 'EIGHTYTHREE,INPATIENT');
  });

  test('empty replies mean no appointments; errors and junk fail', () => {
    assert.deepEqual(parseApptsReply('{"Appointment":[""]}\r\n', 'UTC').appointments, []);
    assert.deepEqual(parseApptsReply('', 'UTC').appointments, []);
    assert.throws(() => parseApptsReply('{"Appointment":[""],"Error":["Invalid Patient ID."]}', 'UTC'), /Invalid Patient ID/);
    assert.throws(() => parseApptsReply('<html>nope</html>', 'UTC'), /Unreadable reply/);
  });
});

describe('patient appointments: dates and settings', () => {
  test('addMonths clamps to the end of a shorter month', () => {
    assert.equal(toIso(addMonths(fromIso('2026-01-31'), 1)), '2026-02-28');
    assert.equal(toIso(addMonths(fromIso('2026-11-18'), 4)), '2027-03-18');
    assert.equal(toIso(addMonths(fromIso('2026-12-31'), 2)), '2027-02-28');
    assert.equal(toIso(addMonths(fromIso('2026-11-18'), 13)), '2027-12-18');
  });

  const resolve = (flags = {}, env = {}) => validateSettings(resolveSettings({ command: 'patient-appts', flags, env: { ...creds, ...env } }), { now: NOW });

  test('default range is today through four months, in the site zone', () => {
    const s = resolve({ dfn: '100791' });
    assert.equal(toIso(s.fromDay), '2026-11-17');
    assert.equal(toIso(s.toDay), '2027-03-17');
  });

  test('--months, --from and --to', () => {
    assert.equal(toIso(resolve({ dfn: '1', months: '2' }).toDay), '2027-01-17');
    const s = resolve({ dfn: '1', from: '2026-09-01', to: '2026-09-30' });
    assert.deepEqual([toIso(s.fromDay), toIso(s.toDay)], ['2026-09-01', '2026-09-30']);
    assert.equal(toIso(resolve({ dfn: '1', from: '2026-09-01', months: '1' }).toDay), '2026-10-01');
  });

  test('bad ranges and a missing patient are usage errors', () => {
    assert.throws(() => resolve({ from: '2026-09-01' }), /patient is required/);
    assert.throws(() => resolve({ dfn: '1', from: '2026-09-30', to: '2026-09-01' }), /before/);
    assert.throws(() => resolve({ dfn: '1', to: '2026-01-01' }), /before/);
    assert.throws(() => resolve({ dfn: '1', from: 'Sept 1 2026' }), /Invalid date/);
    assert.throws(() => resolve({ dfn: '1', from: '2/30/2027' }), /Invalid date/);
    assert.throws(() => resolve({ dfn: '1', from: 'T@9:30' }), /date only/);
    assert.throws(() => resolve({ dfn: '1', months: '0' }), /--months/);
    assert.throws(() => resolve({ dfn: '1', to: '2027-01-01', months: '2' }), /either --to or --months/);
  });
});

describe('patient appointments: command line', () => {
  test('appts --dfn lists every appointment with its status, newest first, and calls only the lookup RPC', async () => {
    const rpc = fakeVista({ appointmentsByDfn: { 100791: [cancelledAppt, bookedAppt, laterAppt] } });
    const r = await run(['--dfn', '100791'], { rpc });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /appointments for DFN 100791 EIGHTYTHREE,INPATIENT, 2026-11-17 \.\. 2027-03-17/);
    assert.match(r.stdout, /DATE\/TIME\s+CLINIC\s+STATUS\s+IEN\s+SCHEDULED BY\s+CANCELLED BY/);
    const lines = r.stdout.split('\n');
    const idx = (ien) => lines.findIndex((l) => new RegExp(`\\b${ien}\\b`).test(l) && /\d{4}-\d\d-\d\d \d\d:\d\d/.test(l));
    assert.ok(idx(65500) > 0 && idx(65500) < idx(65491) && idx(65491) < idx(65457), 'newest first');
    assert.match(lines[idx(65457)], /2026-11-18 07:00\s+CARDIOLOGY\s+CANCELLED BY CLINIC\s+65457\s+TESTER,ONE\s+TESTER,ONE/);
    assert.match(r.stdout, /NO-SHOW/);
    assert.match(r.stdout, /3 appointment\(s\)/);
    assert.deepEqual(readNames(rpc), ['SDES GET APPTS BY PATIENT DFN3']);
    assert.deepEqual(rpc.calls[0].params, ['100791', '2026-11-17T00:00-05:00', '2027-03-17T23:59-04:00']);
  });

  test('patient and range from the settings; plain appts uses APPT_DFN', async () => {
    const rpc = fakeVista({ appointmentsByDfn: { 100791: [bookedAppt] } });
    const viaFlag = await run(['--months', '2'], { rpc, env: { ...creds, APPT_DFN: '100791' } });
    assert.equal(viaFlag.code, 0, viaFlag.stderr);
    assert.equal(rpc.calls[0].params[2], '2027-01-17T23:59-05:00');

    const bare = await run([], { rpc: fakeVista({ appointmentsByDfn: { 100791: [bookedAppt] } }), env: { ...creds, APPT_DFN: '100791' } });
    assert.equal(bare.code, 0, bare.stderr);
    assert.match(bare.stdout, /65491/);
  });

  test('bare appts without a patient prints help; --help always wins; a missing patient is an error', async () => {
    const bare = await run([]);
    assert.equal(bare.code, 2);
    assert.equal(bare.connected, 0);
    assert.match(bare.stdout, /Usage:/);

    const help = await run(['--help'], { env: { ...creds, APPT_DFN: '100791' } });
    assert.equal(help.code, 0);
    assert.equal(help.connected, 0);
    assert.match(help.stdout, /Usage:/);

    const missing = await run(['--months', '2']);
    assert.equal(missing.code, 2);
    assert.equal(missing.connected, 0);
    assert.match(missing.stderr, /patient is required/);
  });

  test('APPT_DFN in the .env file also selects the listing', async () => {
    const file = path.join(dir, 'with-dfn.env');
    writeFileSync(file, 'APPT_DFN=100791\n');
    const r = await run([], { rpc: fakeVista({ appointmentsByDfn: { 100791: [bookedAppt] } }), envFile: file });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /65491/);
  });

  test('no appointments is a normal result that names the range', async () => {
    const r = await run(['--dfn', '100791', '--from', '2026-01-01', '--to', '2026-01-31']);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /No appointments found for DFN 100791 between 2026-01-01 and 2026-01-31/);
  });

  test('an RPC error exits 1 with the text and no table', async () => {
    const rpc = fakeVista({ apptsReply: () => '{"Appointment":[""],"Error":["Invalid Patient ID."]}\r\n' });
    const r = await run(['--dfn', '999999999'], { rpc });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /Invalid Patient ID/);
    assert.doesNotMatch(r.stdout, /DATE\/TIME/);
  });

  test('--json prints one object with the patient, range, and appointments', async () => {
    const r = await run(['--dfn', '100791', '--json'], { rpc: fakeVista({ appointmentsByDfn: { 100791: [cancelledAppt, bookedAppt] } }) });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.ok, true);
    assert.deepEqual(out.patient, { dfn: '100791', name: 'EIGHTYTHREE,INPATIENT' });
    assert.deepEqual(out.range, { from: '2026-11-17', to: '2027-03-17' });
    assert.equal(out.total, 2);
    assert.deepEqual(out.appointments.map((a) => a.status), ['INPATIENT/NO ACT TAKN', 'CANCELLED BY CLINIC']);
    assert.equal(out.appointments[1].cancelledBy, 'TESTER,ONE');
  });

  test('production is blocked and bad ranges fail before connecting', async () => {
    const prod = await run(['--dfn', '1', '--env', 'prod']);
    assert.equal(prod.code, 2);
    assert.equal(prod.connected, 0);
    const bad = await run(['--dfn', '1', '--from', '2026-09-30', '--to', '2026-09-01']);
    assert.equal(bad.code, 2);
    assert.equal(bad.connected, 0);
    assert.match(bad.stderr, /--to must not be before --from/);
  });
});
