// Read-only diagnostic: dump raw SDEC APPSLOTS and SDES GET CLINIC INFO2 replies.
// Usage (from cli/): node testlib/diag-appslots.js <resourceIen> <from YYYY-MM-DD> <to YYYY-MM-DD> <clinicIen>
import { openSession } from '../src/broker/rpcClient.js';
import { loadEnvFile, locateEnvFile, resolveSettings, validateSettings } from '../src/settings.js';

const fileVars = loadEnvFile(locateEnvFile({ cwd: process.cwd(), cliDir: process.cwd() }));
const s = validateSettings(resolveSettings({ command: 'regular', env: process.env, fileVars }));
const [resource = '46', from = '2026-11-17', to = '2026-12-17', clinic = '195'] = process.argv.slice(2);
const client = await openSession(s, () => {});
try {
  const slots = await client.call('SDEC APPSLOTS', [resource, from, to]);
  console.log('APPSLOTS length', slots.length);
  console.log(JSON.stringify(slots.slice(0, 1500)));
  const info = await client.call('SDES GET CLINIC INFO2', [clinic]);
  console.log('CLINIC INFO2', JSON.stringify(info.slice(0, 1500)));
} finally {
  await client.close();
}
