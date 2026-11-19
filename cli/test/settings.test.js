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
