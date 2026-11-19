import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openSession } from './broker/rpcClient.js';
import { buildEnvelope, renderHuman } from './output.js';
import { printAvailabilityGrid } from './render/availabilityGrid.js';
import { createLineReader } from './render/lineReader.js';
import { runCommand } from './scenarios/index.js';
import {
  COMMANDS, LISTING_FLAGS, SCENARIOS, UsageError, assertAllowedEnvironment, assertCredentials, loadEnvFile, locateEnvFile,
  maskedSettings, resolveSettings, validateSettings
} from './settings.js';

const CLI_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const OPTIONS = {
  help: { type: 'boolean', short: 'h' },
  version: { type: 'boolean', short: 'V' },
  json: { type: 'boolean' },
  verbose: { type: 'boolean', short: 'v' },
  check: { type: 'boolean' },
  'env-file': { type: 'string' },
  env: { type: 'string' },
  host: { type: 'string' },
  port: { type: 'string' },
  context: { type: 'string' },
  station: { type: 'string' },
  tz: { type: 'string' },
  dfn: { type: 'string' },
  clinic: { type: 'string' },
  'ancillary-clinic': { type: 'string' },
  'group-clinics': { type: 'string' },
  'search-days': { type: 'string' },
  'past-days': { type: 'string' },
  'future-days': { type: 'string' },
  'block-availability': { type: 'boolean' },
  days: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  months: { type: 'string' },
  'page-size': { type: 'string' },
  at: { type: 'string' },
  length: { type: 'string' },
  appt: { type: 'string' },
  by: { type: 'string' },
  'no-reopen': { type: 'boolean' },
  'reason-ien': { type: 'string' },
  note: { type: 'string' },
  reason: { type: 'string' },
  'dry-run': { type: 'boolean' }
};

export const HELP = `appts - create VistA appointment test scenarios and look things up (dev/sqa only)

Usage:
  appts <scenario> [options]            create test data: regular, osm, osmxgroup, osmancillary
  appts --dfn <dfn> [options]           list a patient's appointments (every status)
  appts availability [options]          show a clinic's availability grid
  appts cancel --appt <ien> [options]   cancel one appointment by its IEN
  appts cancel-availability [options]   cancel a clinic's availability, day by day
  appts --check                         test the connection
  appts --version                       print the installed version
  appts --help

Not installed as "appts"? Run: node appt-cli/bin/appt-scenario.js <same arguments>

Scenarios:
  regular        Request (desired = today) + appointment at the next open slot.
  osm            Desired date >= 60 days ago, appointment >= 60 days out.
  osmxgroup      Verify one group clinic has no availability for 60 days, then
                 desired >= 60 days ago and appointment >= 90 days out in another group clinic.
  osmancillary   Primary + ancillary appointments on the same day >= 90 days out,
                 desired >= 60 days ago, two independent records (no link).

Look-ups (read-only):
  appts --dfn 100791                  Patient's appointments, today through 4 months, newest first.
                                      Plain "appts" does the same when APPT_DFN is set.
  appts availability --clinic 195     Clinic availability as the VistA grid, paged in a terminal.

Commands:
  cancel-availability   Cancel a clinic's availability day by day (SDES CANCEL CLIN AVAILABILITY).

Common options (flag / env var / default):
  --env        APPT_ENV          sqa   (only dev or sqa; prod is always blocked)
  --host       VISTA_HOST        vista.example.com
  --port       VISTA_PORT        9094
  --context    VISTA_CONTEXT     CDSP RPC CONTEXT
  --station    VISTA_STATION     500
  --tz         APPT_TZ           America/New_York
  --dfn        APPT_DFN          patient for scenarios (random test patient if unset) and for the listing
  --search-days APPT_SEARCH_DAYS 30   (forward slot-search window)
               VISTA_ACCESS_CODE / VISTA_VERIFY_CODE  (env or .env only; required)
               APPT_CLOSE_DISPOSITION 6  (ARCLOSE disposition for cleanup)
  --env-file <path>   Load settings from this file instead of ./.env or cli/.env
  --json              Print one JSON object to stdout
  --verbose, -v       Log RPC calls to stderr (credentials masked)
  --check             Validate config, sign on, print user/DUZ, sign off

Scenario options:
  --clinic             regular/osm: APPT_CLINIC 195; osmancillary primary: APPT_PRIMARY_CLINIC 532
  --ancillary-clinic   APPT_ANCILLARY_CLINIC 521   (osmancillary)
  --group-clinics      APPT_GROUP_CLINICS 478,485  (osmxgroup)
  --block-availability osmxgroup: first cancel availability on the first group clinic for 60 days
  --past-days N        desired date offset (minimum 60 for OSM scenarios)
  --future-days N      appointment offset (minimum 60 for osm, 90 for osmxgroup/osmancillary)
  --at "DATE@TIME"      regular only: book at this start (site time), e.g. "1/1/2027@9:30", "T+1@14:00", "T@2:30 PM"
  --length N           regular only: appointment length in minutes (default: the clinic's length)

Dates (--at, --from, --to) accept M/D/YYYY, M/D/YY, T (today), T+N / T-N (days from today) or YYYY-MM-DD,
in site time. --at also needs a time: H:MM or HH:MM (24-hour), or H:MM AM/PM, after an @.

cancel options (one appointment per run; find the IEN with appts --dfn):
  --appt IEN        required: the appointment IEN to cancel
  --by clinic|patient   who cancelled it (default clinic)
  --no-reopen       close the request instead of reopening it (default: reopened)
  --reason-ien N    cancellation reason IEN (default: none)
  --note TEXT       note on the cancellation (default "appts cancel")
  --dry-run         show what would be sent without connecting

cancel-availability options:
  --clinic     APPT_BLOCK_CLINIC 478
  --days N     today through today+N (default 60), or --from DATE --to DATE
  --reason     default "testing"
  --dry-run    print the parameters for each day without calling VistA

Patient appointments options (appts --dfn ...):
  --dfn        required here (or APPT_DFN); no random patient
  --from DATE          start of the range (default today)
  --to DATE            end of the range (default: start plus --months)
  --months N   months after the start (default 4); not with --to

availability options:
  --clinic     APPT_CLINIC 195
  --days N     today through today+N (default 60), or --from DATE --to DATE
  --page-size N  day rows per page in a terminal (default 10; 0 = never pause)

Exit codes: 0 success, 1 scenario/connection failure, 2 usage or safety error.
`;

export async function main({
  argv = process.argv.slice(2),
  env = process.env,
  cwd = process.cwd(),
  stdout = process.stdout,
  stderr = process.stderr,
  stdin = process.stdin,
  connect = openSession,
  now = new Date(),
  random = Math.random,
  interactive,
  readLine
} = {}) {
  let parsed;
  try {
    parsed = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true });
  } catch (err) {
    stderr.write(`${err.message}\n\nRun "appts --help" for usage.\n`);
    return 2;
  }
  const flags = parsed.values;

  if (flags.help) {
    stdout.write(HELP);
    return 0;
  }
  if (flags.version) {
    stdout.write(`appts ${readVersion()}\n`);
    return 0;
  }
  let command = flags.check ? 'check' : parsed.positionals[0] || '';
  if (command && command !== 'check' && !COMMANDS.includes(command)) {
    stderr.write(`Unknown scenario "${command}". Valid scenarios: ${SCENARIOS.join(', ')} (or cancel, cancel-availability, availability)\nRun "appts --help" for usage.\n`);
    return 2;
  }

  let fileVars;
  try {
    fileVars = loadEnvFile(locateEnvFile({ envFile: flags['env-file'], cwd, cliDir: CLI_DIR }));
  } catch (err) {
    stderr.write(`${err.message}\n`);
    return 2;
  }

  // No command name: a listing flag or a default patient means "list this patient's appointments".
  if (!command) {
    const listing = LISTING_FLAGS.some((k) => flags[k] !== undefined) || Boolean(env.APPT_DFN || fileVars.APPT_DFN);
    if (!listing) {
      stdout.write(HELP);
      return 2;
    }
    command = 'patient-appts';
  }

  const log = flags.verbose ? (msg) => stderr.write(`  ${msg}\n`) : () => {};
  let settings;
  try {
    const resolved = resolveSettings({ command: command === 'check' ? 'regular' : command, flags, env, fileVars });
    if (command === 'check') {
      assertAllowedEnvironment(resolved.environment);
      settings = { ...resolved, command: 'check', port: Number(resolved.port) };
    } else {
      settings = validateSettings(resolved, { now });
    }
    const needsConnection = !runsOffline(settings);
    if (needsConnection) assertCredentials(settings);
    if (flags.verbose) log(`settings ${JSON.stringify(maskedSettings(settings))}`);
  } catch (err) {
    stderr.write(`${err instanceof UsageError ? '' : 'Invalid settings: '}${err.message}\n`);
    return 2;
  }

  const emit = (envelope) => {
    if (flags.json) stdout.write(`${JSON.stringify(envelope, null, 2)}\n`);
    else (envelope.ok ? stdout : stderr).write(`${renderHuman(envelope)}\n`);
  };

  let client = null;
  try {
    if (!runsOffline(settings)) {
      client = await connect(settings, log);
    }
    const user = client?.user;
    if (settings.command === 'check') {
      emit(buildEnvelope({ ok: true, settings, user, result: { context: settings.context, division: user?.division || '', productionAccount: false } }));
      return 0;
    }
    const ctx = { rpc: client, user, settings, log, now, random };
    try {
      const result = await runCommand(ctx);
      if (settings.command === 'availability' && !flags.json) {
        await showAvailability({ result, settings, user, stdout, stdin, interactive, readLine });
        return 0;
      }
      emit(buildEnvelope({ ok: true, settings, user, result }));
      return 0;
    } catch (err) {
      emit(buildEnvelope({ ok: false, settings, user, error: err }));
      return 1;
    }
  } catch (err) {
    emit(buildEnvelope({ ok: false, settings, error: err }));
    return 1;
  } finally {
    if (client) await client.close();
  }
}

function readVersion() {
  try {
    return JSON.parse(readFileSync(path.join(CLI_DIR, 'package.json'), 'utf8')).version || 'unknown';
  } catch {
    return 'unknown';
  }
}

// Dry runs that only print what would be sent need no credentials and no connection.
function runsOffline(settings) {
  return Boolean(settings.dryRun) && ['cancel-availability', 'regular', 'cancel'].includes(settings.command);
}

// Human output for `availability`: a title, the grid (paged in a terminal), then the legend.
async function showAvailability({ result, settings, user, stdout, stdin, interactive, readLine }) {
  const tag = `[${settings.environment.toUpperCase()}]`;
  const who = user ? ` as ${user.name || 'DUZ'} (${user.duz})` : '';
  const range = `${result.from} .. ${result.to}`;
  stdout.write(`${tag} availability: clinic ${result.clinicIen} ${result.clinicName}, ${range} @ ${settings.host}:${settings.port}${who}\n`);
  if (!result.days.length) {
    stdout.write(`${tag} No availability found for clinic ${result.clinicIen} between ${result.from} and ${result.to}\n${tag} OK\n`);
    return;
  }

  const paging = interactive ?? Boolean(stdin?.isTTY && stdout?.isTTY);
  const reader = paging && !readLine ? createLineReader(stdin) : null;
  try {
    await printAvailabilityGrid({
      write: (text) => stdout.write(text),
      days: result.days,
      pageSize: settings.pageSize,
      interactive: paging,
      readLine: readLine || reader?.readLine
    });
  } finally {
    reader?.close();
  }
  stdout.write(`${tag} ${result.totalOpenSlots} open slot(s) on ${result.days.length} day(s)\n${tag} OK\n`);
}
