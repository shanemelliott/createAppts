import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { main } from '../src/cli.js';
import { NOW, fakeVista, isoPlus } from '../testlib/fakeVista.js';

const dir = mkdtempSync(path.join(os.tmpdir(), 'appt-cli-'));
const emptyEnv = path.join(dir, 'empty.env');
writeFileSync(emptyEnv, '');
const creds = { VISTA_ACCESS_CODE: 'SECRET-AC-123', VISTA_VERIFY_CODE: 'SECRET-VC-456' };

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

test('bin entry point runs under node', () => {
  const bin = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'bin', 'appt-scenario.js');
  const r = spawnSync(process.execPath, [bin, '--help'], { encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /appt-scenario/);
  const bad = spawnSync(process.execPath, [bin, 'nope'], { encoding: 'utf8' });
  assert.equal(bad.status, 2);
});
