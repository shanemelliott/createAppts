// Read-only probe for task 1.1: dump the raw SDES GET APPTS BY PATIENT DFN3 reply.
// Usage (from cli/): node testlib/probe-patient-appts.js <dfn> [fromYYYY-MM-DD] [toYYYY-MM-DD]
import { openSession } from '../src/broker/rpcClient.js';
import { fromIso, toIso, todayIn, utcOffset, addDays } from '../src/dates.js';
import { loadEnvFile, locateEnvFile, resolveSettings, validateSettings } from '../src/settings.js';

const [dfn, from, to] = process.argv.slice(2);
if (!dfn) {
  console.error('usage: node testlib/probe-patient-appts.js <dfn> [from] [to]');
  process.exit(2);
}

const fileVars = loadEnvFile(locateEnvFile({ cwd: process.cwd(), cliDir: process.cwd() }));
const s = validateSettings(resolveSettings({ command: 'regular', env: process.env, fileVars }));
const today = todayIn(s.tz);
const fromDay = from ? fromIso(from) : addDays(today, -90);
const toDay = to ? fromIso(to) : addDays(today, 120);
const stamp = (day, hhmm) => `${toIso(day)}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}${utcOffset(day, hhmm, s.tz)}`;
const params = [dfn, stamp(fromDay, '0000'), stamp(toDay, '2359')];

const client = await openSession(s, () => {});
try {
  console.log('PARAMS', JSON.stringify(params));
  const raw = await client.call('SDES GET APPTS BY PATIENT DFN3', params);
  console.log('REPLY LENGTH', raw.length);
  console.log(JSON.stringify(raw.slice(0, 4000)));
} catch (err) {
  console.log('ERROR', err.message);
} finally {
  await client.close();
}
