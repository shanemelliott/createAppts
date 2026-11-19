import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { addMonths, assertTimeZone, compareDays, fromIso, todayIn } from './dates.js';

export const SCENARIOS = ['regular', 'osm', 'osmxgroup', 'osmancillary'];
export const QUERY_COMMANDS = ['availability', 'patient-appts'];
export const COMMANDS = [...SCENARIOS, 'cancel-availability', ...QUERY_COMMANDS];
// Flags that select the patient appointments listing when no command name is given.
export const LISTING_FLAGS = ['dfn', 'from', 'to', 'months'];

export const DEFAULTS = {
  APPT_ENV: 'sqa',
  VISTA_HOST: 'vista.example.com',
  VISTA_PORT: '9094',
  VISTA_CONTEXT: 'CDSP RPC CONTEXT',
  VISTA_STATION: '500',
  APPT_CLINIC: '195',
  APPT_PRIMARY_CLINIC: '532',
  APPT_ANCILLARY_CLINIC: '521',
  APPT_GROUP_CLINICS: '478,485',
  APPT_BLOCK_CLINIC: '478',
  APPT_SEARCH_DAYS: '30',
  APPT_TZ: 'America/New_York',
  APPT_CLOSE_DISPOSITION: '6'
};

// Minimum day offsets per scenario: desired date in the past / appointment in the future.
export const MINIMUMS = {
  regular: { past: 0, future: 0 },
  osm: { past: 60, future: 60 },
  osmxgroup: { past: 60, future: 90 },
  osmancillary: { past: 60, future: 90 }
};

export const ALLOWED_ENVIRONMENTS = ['dev', 'sqa'];

export class UsageError extends Error {}

export function parseEnvFile(text) {
  const vars = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2];
    const quoted = /^"(.*)"$/.exec(value) || /^'(.*)'$/.exec(value);
    value = quoted ? quoted[1] : value.replace(/\s+#.*$/, '').trim();
    vars[m[1]] = value;
  }
  return vars;
}

export function locateEnvFile({ envFile, cwd, cliDir }) {
  if (envFile) {
    const resolved = path.resolve(cwd, envFile);
    if (!existsSync(resolved)) throw new UsageError(`--env-file not found: ${resolved}`);
    return resolved;
  }
  for (const candidate of [path.join(cwd, '.env'), path.join(cliDir, '.env')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function loadEnvFile(filePath) {
  return filePath ? parseEnvFile(readFileSync(filePath, 'utf8')) : {};
}

// Precedence: flag > process env > .env file > default.
export function resolveSettings({ command, flags = {}, env = {}, fileVars = {} }) {
  const pick = (flag, name) => {
    if (flag !== undefined && flag !== '') return String(flag);
    if (env[name] !== undefined && env[name] !== '') return String(env[name]);
    if (fileVars[name] !== undefined && fileVars[name] !== '') return String(fileVars[name]);
    return DEFAULTS[name] ?? '';
  };

  const clinicVar = command === 'osmancillary'
    ? 'APPT_PRIMARY_CLINIC'
    : command === 'cancel-availability' ? 'APPT_BLOCK_CLINIC' : 'APPT_CLINIC';

  return {
    command,
    environment: pick(flags.env, 'APPT_ENV').toLowerCase(),
    host: pick(flags.host, 'VISTA_HOST'),
    port: pick(flags.port, 'VISTA_PORT'),
    context: pick(flags.context, 'VISTA_CONTEXT'),
    station: pick(flags.station, 'VISTA_STATION'),
    accessCode: pick(undefined, 'VISTA_ACCESS_CODE'),
    verifyCode: pick(undefined, 'VISTA_VERIFY_CODE'),
    dfn: pick(flags.dfn, 'APPT_DFN'),
    clinic: pick(flags.clinic, clinicVar),
    clinicVar,
    ancillaryClinic: pick(flags['ancillary-clinic'], 'APPT_ANCILLARY_CLINIC'),
    groupClinics: pick(flags['group-clinics'], 'APPT_GROUP_CLINICS').split(',').map((s) => s.trim()).filter(Boolean),
    searchDays: pick(flags['search-days'], 'APPT_SEARCH_DAYS'),
    tz: pick(flags.tz, 'APPT_TZ'),
    closeDisposition: pick(undefined, 'APPT_CLOSE_DISPOSITION'),
    pastDays: flags['past-days'],
    futureDays: flags['future-days'],
    blockAvailability: Boolean(flags['block-availability']),
    days: flags.days,
    from: flags.from,
    to: flags.to,
    months: flags.months,
    pageSize: flags['page-size'],
    reason: flags.reason || 'testing',
    dryRun: Boolean(flags['dry-run'])
  };
}

// Runs before any network I/O; there is intentionally no override.
export function assertAllowedEnvironment(environment) {
  if (!ALLOWED_ENVIRONMENTS.includes(String(environment || '').toLowerCase())) {
    throw new UsageError(
      `Environment "${environment}" is not allowed. Only ${ALLOWED_ENVIRONMENTS.join(' and ')} are permitted; production is always blocked.`
    );
  }
}

export function assertCredentials(settings) {
  const missing = [];
  if (!settings.accessCode) missing.push('VISTA_ACCESS_CODE');
  if (!settings.verifyCode) missing.push('VISTA_VERIFY_CODE');
  if (missing.length) {
    throw new UsageError(`Missing required setting(s): ${missing.join(', ')}. Set them in the environment or a .env file.`);
  }
}

function positiveInt(value, label, min = 0) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw new UsageError(`${label} must be an integer >= ${min} (got "${value}")`);
  return n;
}

function numericId(value, label) {
  if (!/^\d+$/.test(String(value))) throw new UsageError(`${label} must be numeric (got "${value}")`);
  return String(value);
}

// Validates and normalizes settings for the command; throws UsageError before any connection is made.
export function validateSettings(settings, { now = new Date() } = {}) {
  const s = { ...settings };
  const { command } = s;
  if (!COMMANDS.includes(command)) {
    throw new UsageError(`Unknown command "${command}". Valid: ${COMMANDS.join(', ')}`);
  }

  assertAllowedEnvironment(s.environment);
  assertTimeZone(s.tz);
  s.port = positiveInt(s.port, 'VISTA_PORT / --port', 1);
  s.searchDays = positiveInt(s.searchDays, 'APPT_SEARCH_DAYS / --search-days', 1);
  if (s.dfn) s.dfn = numericId(s.dfn, 'APPT_DFN / --dfn');
  s.closeDisposition = numericId(s.closeDisposition, 'APPT_CLOSE_DISPOSITION');

  if (SCENARIOS.includes(command)) {
    const min = MINIMUMS[command];
    s.pastDays = s.pastDays === undefined ? min.past : positiveInt(s.pastDays, '--past-days');
    s.futureDays = s.futureDays === undefined ? min.future : positiveInt(s.futureDays, '--future-days');
    if (s.pastDays < min.past) throw new UsageError(`--past-days must be at least ${min.past} for ${command}`);
    if (s.futureDays < min.future) throw new UsageError(`--future-days must be at least ${min.future} for ${command}`);
  }

  if (command === 'osmxgroup') {
    s.groupClinics = s.groupClinics.map((c) => numericId(c, 'APPT_GROUP_CLINICS / --group-clinics'));
    if (new Set(s.groupClinics).size < 2) {
      throw new UsageError('osmxgroup needs at least two different clinic IENs in --group-clinics / APPT_GROUP_CLINICS');
    }
  } else if (command !== 'patient-appts') {
    s.clinic = numericId(s.clinic, `${s.clinicVar} / --clinic`);
  }

  if (command === 'osmancillary') {
    s.ancillaryClinic = numericId(s.ancillaryClinic, 'APPT_ANCILLARY_CLINIC / --ancillary-clinic');
    if (s.ancillaryClinic === s.clinic) {
      throw new UsageError('--ancillary-clinic must be different from the primary clinic');
    }
  }

  if (command === 'cancel-availability' || command === 'availability') {
    if ((s.from && !s.to) || (!s.from && s.to)) throw new UsageError('--from and --to must be used together');
    if (s.from) {
      s.fromDay = fromIso(s.from);
      s.toDay = fromIso(s.to);
      if (compareDays(s.toDay, s.fromDay) < 0) throw new UsageError('--to must not be before --from');
      if (s.days !== undefined) throw new UsageError('Use either --days or --from/--to, not both');
    } else {
      s.days = s.days === undefined ? 60 : positiveInt(s.days, '--days');
    }
  }

  if (command === 'availability') {
    s.pageSize = s.pageSize === undefined ? 10 : positiveInt(s.pageSize, '--page-size');
  }

  if (command === 'patient-appts') {
    if (!s.dfn) throw new UsageError('A patient is required: pass --dfn or set APPT_DFN.');
    if (s.to && s.months !== undefined) throw new UsageError('Use either --to or --months, not both');
    s.months = s.months === undefined ? 4 : positiveInt(s.months, '--months', 1);
    s.fromDay = s.from ? fromIso(s.from) : todayIn(s.tz, now);
    s.toDay = s.to ? fromIso(s.to) : addMonths(s.fromDay, s.months);
    if (compareDays(s.toDay, s.fromDay) < 0) throw new UsageError('--to must not be before --from (the start defaults to today)');
  }

  return s;
}

export function maskedSettings(settings) {
  return {
    ...settings,
    accessCode: settings.accessCode ? '****' : '',
    verifyCode: settings.verifyCode ? '****' : ''
  };
}
