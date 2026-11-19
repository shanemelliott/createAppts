// Probe for task 1.1: capture real SDEC APPDEL / SDEC ARCLOSE replies on dev.
// Usage (from cli/): node testlib/probe-cleanup.js <appointmentIen-to-cancel> <dfn> <clinicIen>
// Cancels the given appointment (SDF=2), then creates and closes one throwaway request.
import { openSession } from '../src/broker/rpcClient.js';
import { requestDateTime, todayIn } from '../src/dates.js';
import { loadEnvFile, locateEnvFile, resolveSettings, validateSettings } from '../src/settings.js';
import {
  buildAppdelParams, buildArcloseParams, buildArsetParams, parseAppdelResponse, parseArcloseResponse, parseArsetResponse
} from '../src/vista/scheduling.js';

const [appointmentIen, dfn, clinicIen] = process.argv.slice(2);
if (!appointmentIen || !dfn || !clinicIen) {
  console.error('usage: node testlib/probe-cleanup.js <appointmentIen> <dfn> <clinicIen>');
  process.exit(2);
}

const fileVars = loadEnvFile(locateEnvFile({ cwd: process.cwd(), cliDir: process.cwd() }));
const s = validateSettings(resolveSettings({ command: 'regular', env: process.env, fileVars }));
const client = await openSession(s, () => {});
try {
  const duz = client.user.duz;
  const show = (label, raw) => console.log(`${label}: ${JSON.stringify(raw)}`);

  const appdelParams = buildAppdelParams(appointmentIen, duz);
  console.log('APPDEL params', JSON.stringify(appdelParams));
  const appdelRaw = await client.call('SDEC APPDEL', appdelParams);
  show('APPDEL reply', appdelRaw);
  console.log('APPDEL parsed', JSON.stringify(parseAppdelResponse(appdelRaw)));

  const arsetRaw = await client.call('SDEC ARSET', buildArsetParams({
    dfn, requestDateTime: requestDateTime(s.tz), institution: client.user.division, clinicIen, duz,
    desiredDay: todayIn(s.tz), comment: 'appt-scenario probe'
  }));
  const requestIen = parseArsetResponse(arsetRaw);
  console.log('created throwaway request', requestIen);

  const arcloseParams = buildArcloseParams(requestIen, s.closeDisposition, duz);
  console.log('ARCLOSE params', JSON.stringify(arcloseParams));
  const arcloseRaw = await client.call('SDEC ARCLOSE', arcloseParams);
  show('ARCLOSE reply', arcloseRaw);
  console.log('ARCLOSE parsed', JSON.stringify(parseArcloseResponse(arcloseRaw)));
} finally {
  await client.close();
}
