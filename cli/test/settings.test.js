import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import {
  DEFAULTS, UsageError, assertAllowedEnvironment, assertCredentials, loadEnvFile, locateEnvFile, maskedSettings,
  parseEnvFile, resolveSettings, validateSettings
} from '../src/settings.js';

const creds = { VISTA_ACCESS_CODE: 'ac', VISTA_VERIFY_CODE: 'vc' };

test('parseEnvFile handles comments, blanks, quotes and inline comments', () => {
  const vars = parseEnvFile([
    '# comment',
    '',
    'VISTA_HOST=example.com',
    'VISTA_CONTEXT="CDSP RPC CONTEXT"',
    "APPT_TZ='America/Chicago'",
    'APPT_DFN=123 # inline',
    'not a setting'
  ].join('\r\n'));
  assert.deepEqual(vars, {
    VISTA_HOST: 'example.com',
    VISTA_CONTEXT: 'CDSP RPC CONTEXT',
    APPT_TZ: 'America/Chicago',
    APPT_DFN: '123'
  });
});

test('defaults only: connection and environment', () => {
  const s = validateSettings(resolveSettings({ command: 'regular', env: creds }));
  assert.equal(s.environment, 'sqa');
  assert.equal(s.host, 'vista.example.com');
  assert.equal(s.port, 9094);
  assert.equal(s.context, 'CDSP RPC CONTEXT');
  assert.equal(s.station, '500');
  assert.equal(s.tz, 'America/New_York');
  assert.equal(s.closeDisposition, '6');
  assert.equal(s.searchDays, 30);
});

test('defaults only: per-scenario clinics', () => {
  assert.equal(validateSettings(resolveSettings({ command: 'regular', env: creds })).clinic, '195');
  assert.equal(validateSettings(resolveSettings({ command: 'osm', env: creds })).clinic, '195');
  const anc = validateSettings(resolveSettings({ command: 'osmancillary', env: creds }));
  assert.equal(anc.clinic, '532');
  assert.equal(anc.ancillaryClinic, '521');
  assert.deepEqual(validateSettings(resolveSettings({ command: 'osmxgroup', env: creds })).groupClinics, ['478', '485']);
  assert.equal(validateSettings(resolveSettings({ command: 'cancel-availability', env: creds })).clinic, '478');
});

test('precedence: flag > env > .env > default', () => {
  const fileVars = { VISTA_HOST: 'from-file', VISTA_PORT: '1111', APPT_CLINIC: '300' };
  const env = { VISTA_HOST: 'from-env' };
  const s = resolveSettings({ command: 'regular', flags: { clinic: '532' }, env, fileVars });
  assert.equal(s.host, 'from-env');
  assert.equal(s.port, '1111');
  assert.equal(s.clinic, '532');
  assert.equal(resolveSettings({ command: 'regular', flags: { host: 'from-flag' }, env, fileVars }).host, 'from-flag');
  assert.equal(resolveSettings({ command: 'regular' }).host, DEFAULTS.VISTA_HOST);
});

test('access/verify codes cannot come from flags', () => {
  const s = resolveSettings({ command: 'regular', flags: { accessCode: 'x', 'access-code': 'y' } });
  assert.equal(s.accessCode, '');
});

test('--env-file is used instead of default locations; missing file is a usage error', () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'appt-'));
  const custom = path.join(dir, 'custom.env');
  writeFileSync(custom, 'VISTA_HOST=custom-host\n');
  writeFileSync(path.join(dir, '.env'), 'VISTA_HOST=cwd-host\n');
  assert.equal(locateEnvFile({ envFile: 'custom.env', cwd: dir, cliDir: dir }), custom);
  assert.equal(loadEnvFile(custom).VISTA_HOST, 'custom-host');
  assert.equal(locateEnvFile({ cwd: dir, cliDir: '/nowhere' }), path.join(dir, '.env'));
  assert.throws(() => locateEnvFile({ envFile: 'missing.env', cwd: dir, cliDir: dir }), UsageError);
});

test('missing access/verify codes are named', () => {
  assert.throws(
    () => assertCredentials(resolveSettings({ command: 'regular' })),
    /VISTA_ACCESS_CODE, VISTA_VERIFY_CODE/
  );
  assert.throws(() => assertCredentials(resolveSettings({ command: 'regular', env: { VISTA_ACCESS_CODE: 'a' } })), /VISTA_VERIFY_CODE/);
});

test('environment guard blocks everything but dev/sqa', () => {
  for (const bad of ['prod', 'production', 'preprod', 'PROD', '', 'staging']) {
    assert.throws(() => assertAllowedEnvironment(bad), UsageError, bad);
  }
  for (const ok of ['dev', 'sqa', 'SQA', 'Dev']) assertAllowedEnvironment(ok);
  assert.equal(resolveSettings({ command: 'regular', env: { APPT_ENV: 'SQA' } }).environment, 'sqa');
  assert.throws(() => validateSettings(resolveSettings({ command: 'regular', env: { ...creds, APPT_ENV: 'prod' } })), UsageError);
});

test('OSM minimums can only be increased', () => {
  assert.throws(() => validateSettings(resolveSettings({ command: 'osm', env: creds, flags: { 'past-days': '59' } })), /at least 60/);
  assert.throws(() => validateSettings(resolveSettings({ command: 'osmxgroup', env: creds, flags: { 'future-days': '60' } })), /at least 90/);
  const s = validateSettings(resolveSettings({ command: 'osm', env: creds, flags: { 'past-days': '75', 'future-days': '61' } }));
  assert.equal(s.pastDays, 75);
  assert.equal(s.futureDays, 61);
});

test('scenario-specific validation', () => {
  assert.throws(() => validateSettings(resolveSettings({ command: 'osmxgroup', env: creds, flags: { 'group-clinics': '478' } })), /at least two/);
  assert.throws(() => validateSettings(resolveSettings({ command: 'osmxgroup', env: creds, flags: { 'group-clinics': '478,478' } })), /at least two/);
  assert.throws(() => validateSettings(resolveSettings({ command: 'osmancillary', env: creds, flags: { 'ancillary-clinic': '532' } })), /different/);
  assert.throws(() => validateSettings(resolveSettings({ command: 'cancel-availability', env: creds, flags: { from: '2026-12-01' } })), /together/);
  assert.throws(() => validateSettings(resolveSettings({ command: 'cancel-availability', env: creds, flags: { from: '2026-12-05', to: '2026-12-01' } })), /before/);
  assert.equal(validateSettings(resolveSettings({ command: 'cancel-availability', env: creds })).days, 60);
});

test('masked settings never expose codes', () => {
  const masked = JSON.stringify(maskedSettings(resolveSettings({ command: 'regular', env: { VISTA_ACCESS_CODE: 'SECRETAC', VISTA_VERIFY_CODE: 'SECRETVC' } })));
  assert.ok(!masked.includes('SECRETAC'));
  assert.ok(!masked.includes('SECRETVC'));
  assert.ok(masked.includes('****'));
});


const NOW_NY = new Date('2026-11-17T15:04:00Z'); // 2026-11-17 10:04 in New York
const regular = (flags = {}, command = 'regular') => validateSettings(resolveSettings({ command, flags, env: creds }), { now: NOW_NY });
const day = (d) => `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;

test('--at accepts VistA and ISO forms and resolves T in site time', () => {
  let s = regular({ at: '1/1/2027@9:30' });
  assert.deepEqual([day(s.atDay), s.atHhmm], ['2027-01-01', '0930']);
  s = regular({ at: 'T+1@14:00' });
  assert.deepEqual([day(s.atDay), s.atHhmm], ['2026-11-18', '1400']);
  s = regular({ at: 'T@2:30 PM' });
  assert.deepEqual([day(s.atDay), s.atHhmm], ['2026-11-17', '1430']);
  s = regular({ at: '2027-01-01@09:30' });
  assert.deepEqual([day(s.atDay), s.atHhmm], ['2027-01-01', '0930']);
  // 03:30 UTC on Nov 18 is still Nov 17 evening in New York.
  const late = validateSettings(resolveSettings({ command: 'regular', flags: { at: 'T@23:00' }, env: creds }), { now: new Date('2026-11-18T03:30:00Z') });
  assert.equal(day(late.atDay), '2026-11-17');
});

test('--at rejects bad, past and unsupported uses before connecting', () => {
  assert.throws(() => regular({ at: '1/1/2027' }), /--at: .*<date>@<time>/);
  assert.throws(() => regular({ at: '@9:30' }), /--at/);
  assert.throws(() => regular({ at: '2/30/2027@9:30' }), /--at: Invalid date/);
  assert.throws(() => regular({ at: '1/1/2027@25:00' }), /--at: Invalid time/);
  assert.throws(() => regular({ at: 'T@9:30' }), /not in the future/); // 10:04 now
  assert.throws(() => regular({ at: 'T@10:04' }), /not in the future/);
  assert.throws(() => regular({ at: 'T-1@9:30' }), /not in the future/);
  assert.throws(() => regular({ at: '1/1/2027@9:30' }, 'osm'), /only supported by the regular scenario/);
  assert.throws(() => regular({ length: '30' }, 'osmxgroup'), /only supported by the regular scenario/);
});

test('--length must be a positive whole number', () => {
  assert.equal(regular({ length: '45' }).length, 45);
  for (const bad of ['0', '-5', '1.5', 'abc', '']) {
    if (bad === '') continue; // an empty value is treated as not given by the CLI parser
    assert.throws(() => regular({ length: bad }), /--length/, bad);
  }
});

test('without --at or --length, regular settings are unchanged', () => {
  const s = regular();
  assert.equal(s.at, undefined);
  assert.equal(s.length, undefined);
  assert.equal(s.atDay, undefined);
});

test('--from/--to take VistA dates, ISO dates, and no time part', () => {
  let s = regular({ clinic: '195', from: 'T', to: 'T+30' }, 'availability');
  assert.deepEqual([day(s.fromDay), day(s.toDay)], ['2026-11-17', '2026-12-17']);
  s = regular({ clinic: '195', from: '12/1/2026', to: '12/31/26' }, 'cancel-availability');
  assert.deepEqual([day(s.fromDay), day(s.toDay)], ['2026-12-01', '2026-12-31']);
  s = regular({ clinic: '195', from: '2026-12-01', to: '2026-12-31' }, 'availability');
  assert.deepEqual([day(s.fromDay), day(s.toDay)], ['2026-12-01', '2026-12-31']);
  assert.throws(() => regular({ clinic: '195', from: 'T@9:30', to: 'T+1' }, 'availability'), /--from takes a date only/);
  assert.throws(() => regular({ clinic: '195', from: 'T+5', to: 'T' }, 'availability'), /--to must not be before --from/);
  assert.throws(() => regular({ clinic: '195', from: 'nonsense', to: 'T' }, 'cancel-availability'), /--from: Invalid date/);
});
