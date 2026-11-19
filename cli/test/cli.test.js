import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { main } from '../src/cli.js';
import { NOW, fakeVista, isoPlus } from '../testlib/fakeVista.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'appt-cli-'));
const emptyEnv = path.join(dir, 'empty.env');
writeFileSync(emptyEnv, '');
const creds = { VISTA_HOST: 'vista.example.com', VISTA_ACCESS_CODE: 'SECRET-AC-123', VISTA_VERIFY_CODE: 'SECRET-VC-456' };

function sink() {
  let text = '';
  return { write: (s) => { text += s; return true; }, get text() { return text; } };
}

async function run(argv, { env = creds, rpc = fakeVista(), connectFails } = {}) {
  const stdout = sink();
  const stderr = sink();
  let connected = 0;
  const connect = async (settings, log) => {
    connected += 1;
    if (connectFails) throw new Error(connectFails);
    log(`connect ${settings.host}`);
    return Object.assign(rpc, { user: { duz: '520', name: 'TESTER,ONE', division: 'CAMP MASTER' }, close: async () => {} });
  };
  const code = await main({ argv: [...argv, '--env-file', emptyEnv], env, cwd: dir, stdout, stderr, connect, now: NOW, random: () => 0 });
  return { code, stdout: stdout.text, stderr: stderr.text, connected, rpc };
}

test('--help lists scenarios and cancel-availability without connecting', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  for (const name of ['regular', 'osm', 'osmxgroup', 'osmancillary', 'cancel-availability', 'APPT_ENV']) assert.ok(r.stdout.includes(name), name);
  assert.equal(r.connected, 0);
});

test('unknown scenario exits non-zero and lists valid names', async () => {
  const r = await run(['foo']);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /regular, osm, osmxgroup, osmancillary/);
});

test('production is blocked before connecting', async () => {
  for (const env of ['prod', 'production', 'preprod']) {
    const r = await run(['regular', '--env', env]);
    assert.equal(r.code, 2, env);
    assert.equal(r.connected, 0, env);
    assert.match(r.stderr, /not allowed/);
  }
  const viaEnv = await run(['--check'], { env: { ...creds, APPT_ENV: 'PROD' } });
  assert.equal(viaEnv.code, 2);
  assert.equal(viaEnv.connected, 0);
});

test('missing credentials are named and nothing connects', async () => {
  const r = await run(['regular'], { env: {} });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /VISTA_ACCESS_CODE, VISTA_VERIFY_CODE/);
  assert.equal(r.connected, 0);
});

test('a missing VISTA_HOST is named before connecting; offline dry runs do not need it', async () => {
  const noHost = { VISTA_ACCESS_CODE: 'ac', VISTA_VERIFY_CODE: 'vc' };
  const r = await run(['regular'], { env: noHost });
  assert.equal(r.code, 2);
  assert.equal(r.connected, 0);
  assert.match(r.stderr, /VISTA_HOST/);
  assert.equal((await run(['--check'], { env: noHost })).code, 2);
  assert.equal((await run(['regular', '--dry-run'], { env: {} })).code, 0);
  assert.equal((await run(['regular'], { env: { ...noHost, VISTA_HOST: 'vista.example.com' } })).code, 1); // reaches the fake broker (no slots)
  assert.equal((await run(['--host', 'vista.example.com', '--check'], { env: noHost })).code, 0);
});

test('osmxgroup with fewer than two clinics exits before connecting', async () => {
  const r = await run(['osmxgroup', '--group-clinics', '478']);
  assert.equal(r.code, 2);
  assert.equal(r.connected, 0);
});

test('--json success prints exactly one JSON object; environment defaults to sqa', async () => {
  const rpc = fakeVista({ slots: { 1195: [{ iso: isoPlus(1), start: '0900', end: '0930' }] } });
  const r = await run(['regular', '--json'], { rpc });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, true);
  assert.equal(out.environment, 'sqa');
  assert.equal(out.appointments[0].appointmentIen, '7001');
  assert.equal(out.appointments[0].slot, undefined);
});

test('failures exit 1; --json still prints a single object with cleanup info', async () => {
  const rpc = fakeVista({ slots: { 1195: [{ iso: isoPlus(1), start: '0900', end: '0930' }] }, appadd: () => 'NO OPEN SLOTS' });
  const r = await run(['regular', '--json'], { rpc });
  assert.equal(r.code, 1);
  const out = JSON.parse(r.stdout);
  assert.equal(out.ok, false);
  assert.equal(out.cleanup.removed[0].type, 'request');
});

test('connection failures exit 1 with the message', async () => {
  const r = await run(['regular'], { connectFails: 'Could not connect to vista.example.com:9094' });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /Could not connect to vista\.example\.com:9094/);
});

test('verbose output never contains access/verify codes', async () => {
  const rpc = fakeVista({ slots: { 1195: [{ iso: isoPlus(1), start: '0900', end: '0930' }] } });
  const r = await run(['regular', '--verbose'], { rpc });
  assert.equal(r.code, 0);
  const all = r.stdout + r.stderr;
  assert.ok(all.includes('****'));
  assert.ok(!all.includes('SECRET-AC-123') && !all.includes('SECRET-VC-456'));
});

test('--check reports environment, host and user', async () => {
  const r = await run(['--check']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /\[SQA\] check @ vista\.example\.com:9094 station 500 as TESTER,ONE \(520\)/);
  assert.equal(r.rpc.calls.length, 0);
});

test('cancel-availability --dry-run needs no credentials or connection', async () => {
  const r = await run(['cancel-availability', '--dry-run', '--days', '1'], { env: {} });
  assert.equal(r.code, 0);
  assert.equal(r.connected, 0);
  assert.match(r.stdout, /DRY RUN/);
});

test('regular --at/--length: dry run needs no credentials or connection', async () => {
  const r = await run(['regular', '--dry-run', '--at', 'T+3@2:30 PM', '--length', '45'], { env: {} });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.connected, 0);
  assert.match(r.stdout, /DRY RUN: would book in clinic 195/);
  assert.match(r.stdout, /start 2026-11-20 14:30 to 15:15 \(site time America\/New_York\)/);
  assert.match(r.stdout, /length 45 min/);

  const json = await run(['regular', '--dry-run', '--at', 'T+3@2:30 PM', '--json'], { env: {} });
  const out = JSON.parse(json.stdout);
  assert.deepEqual(out.plan, { clinicIen: '195', start: '2026-11-20 14:30', lengthMinutes: 'clinic default', tz: 'America/New_York' });
  assert.equal(json.connected, 0);
});

test('regular --at/--length: bad values fail before connecting; other scenarios reject them', async () => {
  for (const argv of [['regular', '--at', '1/1/2027'], ['regular', '--at', 'T-1@9:00'], ['regular', '--length', '0'], ['osm', '--length', '30']]) {
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.connected, 0, argv.join(' '));
  }
});

test('regular --at/--length: JSON and human output show start, end and length', async () => {
  const rpc = fakeVista({
    slots: { 1195: Array.from({ length: 8 }, (_, i) => ({ iso: isoPlus(3), start: `${String(8 + Math.floor(i / 4)).padStart(2, '0')}${String((i % 4) * 15).padStart(2, '0')}`, end: `${String(8 + Math.floor((i + 1) / 4)).padStart(2, '0')}${String(((i + 1) % 4) * 15).padStart(2, '0')}` })) },
    clinicInfo: { 195: { Clinic: { LengthOfAppointment: '30' } } }
  });
  const r = await run(['regular', '--at', 'T+3@8:30', '--length', '30', '--json'], { rpc });
  assert.equal(r.code, 0, r.stderr);
  const a = JSON.parse(r.stdout).appointments[0];
  assert.deepEqual([a.appointmentDate, a.start, a.end, a.lengthMinutes], ['2026-11-20', '0830', '0900', 30]);

  const rpc2 = fakeVista({ slots: { 1195: [{ iso: isoPlus(1), start: '0900', end: '0930' }] } });
  const human = await run(['regular'], { rpc: rpc2 });
  assert.match(human.stdout, /appointment 7001 on 2026-11-18 09:00-09:30 \(30 min\)/);
});

test('cancel: default call, human and JSON output', async () => {
  const rpc = fakeVista();
  const r = await run(['cancel', '--appt', '65491'], { rpc });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /cancelled appointment 65491 \(by clinic, request reopened\)/);
  assert.match(r.stdout, /reason IEN none, note "appts cancel"/);
  assert.deepEqual(rpc.named('SDEC APPDEL')[0].params, ['65491', 'C', '', 'appts cancel', '', '520', '', '1']);

  const json = await run(['cancel', '--appt', '65491', '--by', 'patient', '--no-reopen', '--reason-ien', '5', '--note', 'cleanup', '--json']);
  const out = JSON.parse(json.stdout);
  assert.equal(out.ok, true);
  assert.deepEqual(
    [out.appointmentIen, out.cancelType, out.reopened, out.reasonIen, out.note],
    ['65491', 'patient', false, '5', 'cleanup']
  );
});

test('cancel: --dry-run needs no credentials or connection', async () => {
  const r = await run(['cancel', '--appt', '65491', '--dry-run'], { env: {} });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(r.connected, 0);
  assert.match(r.stdout, /DRY RUN: would cancel appointment 65491 \(by clinic, request reopened\)/);
});

test('cancel: VistA refusing exits 1 with the text and no success line', async () => {
  const r = await run(['cancel', '--appt', '99999999'], { rpc: fakeVista({ appdel: () => 'SDEC08: Invalid Appointment ID' }) });
  assert.equal(r.code, 1);
  assert.match(r.stderr, /FAILED: Could not cancel appointment 99999999: SDEC08: Invalid Appointment ID/);
  assert.doesNotMatch(r.stdout + r.stderr, /cancelled appointment/);
});

test('cancel: bad input and the bulk forms fail before connecting', async () => {
  const bad = [
    ['cancel'], ['cancel', '--appt', 'abc'], ['cancel', '--appt', ''],
    ['cancel', '--dfn', '100126'], ['cancel', '--from', 'T', '--to', 'T+7'], ['cancel', '--months', '2'],
    ['cancel', '--appt', '1', '--by', 'nurse'], ['cancel', '--appt', '1', '--reason-ien', 'x'], ['cancel', '--appt', '1', '--note', 'a\nb']
  ];
  for (const argv of bad) {
    const r = await run(argv);
    assert.equal(r.code, 2, argv.join(' '));
    assert.equal(r.connected, 0, argv.join(' '));
  }
  assert.match((await run(['cancel', '--dfn', '1'])).stderr, /--appt/);
  assert.match((await run(['cancel', '--appt', '1', '--by', 'nurse'])).stderr, /clinic or patient/);
});

test('cancel: production is blocked before connecting', async () => {
  const r = await run(['cancel', '--appt', '65491', '--env', 'prod']);
  assert.equal(r.code, 2);
  assert.equal(r.connected, 0);
});

test('--version and -V print the package version without connecting or needing credentials', async () => {
  const expected = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
  for (const flag of ['--version', '-V']) {
    const r = await run([flag], { env: {} });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, `appts ${expected}\n`);
    assert.equal(r.connected, 0);
  }
  assert.match((await run(['--help'])).stdout, /appts --version/);
});

test('bin entry point runs under node', () => {
  const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'appt-scenario.js');
  const r = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /appt-scenario/);
  const bad = spawnSync(process.execPath, [bin, 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
