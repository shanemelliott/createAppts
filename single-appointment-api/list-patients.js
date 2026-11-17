require('dotenv').config();
const axios = require('axios');
const https = require('https');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

function parseDefaultPatients(rawResult) {
  const findFirstString = (obj) => {
    if (typeof obj === 'string') return obj;
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findFirstString(item);
        if (found) return found;
      }
    }
    if (obj && typeof obj === 'object') {
      for (const val of Object.values(obj)) {
        const found = findFirstString(val);
        if (found) return found;
      }
    }
    return null;
  };

  const payload = findFirstString(rawResult) || '';
  const rows = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\^/.test(line));

  return rows.map((line) => {
    const parts = line.split('^');
    const dfn = parts[0];
    const displayName = parts[parts.length - 1] || parts[1] || '';
    return {
      dfn,
      name: displayName,
      display: `${displayName} (${dfn})`
    };
  });
}

async function main() {
  const tokenServerUrl = process.env.TOKEN_SERVER_URL;
  const baseUrl = process.env.VISTA_API_BASE_URL;
  const siteId = process.env.VISTA_SITE_ID;
  const apiKey = process.env.VISTA_API_KEY;

  console.log('Getting patient list...\n');

  // Get token
  const tokenRes = await axios.get(tokenServerUrl, { httpsAgent });
  const token = tokenRes.data?.token;
  if (!token) {
    throw new Error('No token received');
  }

  // Extract DUZ
  const parts = token.split('.');
  const payload = JSON.parse(Buffer.from(
    parts[1].replace(/-/g, '+').replace(/_/g, '/').padEnd(parts[1].length + (4 - parts[1].length % 4) % 4, '='),
    'base64'
  ).toString('utf8'));

  const vistaEntry = payload.vistaIds?.find(v => String(v.siteId) === String(siteId));
  if (!vistaEntry) {
    throw new Error(`No vistaIds entry for siteId=${siteId}`);
  }
  const duz = vistaEntry.duz;

  // Call RPC
  const url = `${baseUrl}/vista-sites/${siteId}/users/${duz}/rpc/invoke`;
  const rpcPayload = {
    context: 'OR CPRS GUI CHART',
    rpc: 'ORQPT DEFAULT PATIENT LIST',
    jsonResult: false,
    parameters: []
  };

  const rpcRes = await axios.post(url, rpcPayload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'X-OCTO-VistA-API': apiKey
    },
    httpsAgent,
    timeout: 30000
  });

  // Debug: Show raw response
  console.log('Raw RPC Response:');
  console.log(JSON.stringify(rpcRes.data, null, 2));
  console.log('\n' + '='.repeat(60) + '\n');
  
  // Parse and display patients
  const patients = parseDefaultPatients(rpcRes.data);
  
  console.log(`Found ${patients.length} patients:\n`);
  console.log('DFN        | Patient Name');
  console.log('-'.repeat(60));
  
  patients.forEach(patient => {
    console.log(`${patient.dfn.padEnd(10)} | ${patient.name}`);
  });
  
  console.log('\n' + '='.repeat(60));
  console.log(`Total: ${patients.length} patients`);
}

main().catch(err => {
  console.error('ERROR:', err.message || err);
  console.error('Full error:', err);
  if (err.response) {
    console.error('HTTP status:', err.response.status);
    console.error('Response:', JSON.stringify(err.response.data));
  }
  if (err.stack) {
    console.error('Stack:', err.stack);
  }
  process.exit(1);
});
