import 'dotenv/config';
import axios from 'axios';
import https from 'https';
import { getToken, getDuzForSite } from './src/services/tokenService.js';

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

const SITE_ID = '500';
const CLINIC_IEN = '478';
const YEAR = 2026;
const monthArgs = process.argv.slice(2).filter(a => /^\d{1,2}$/.test(a)).map(Number);
const MONTHS = monthArgs.length ? monthArgs : [11, 12];
const TZ = '-05:00';
const REASON = 'testing';
const DRY_RUN = process.argv.includes('--dry-run');

async function main() {
  const baseUrl = process.env.VISTA_API_BASE_URL;
  const apiKey = process.env.VISTA_API_KEY;

  const token = await getToken();
  const duz = await getDuzForSite(SITE_ID);

  const url = `${baseUrl}/vista-sites/${SITE_ID}/users/${duz}/rpc/invoke`;
  console.log(`Site ${SITE_ID}, DUZ ${duz}, clinic ${CLINIC_IEN}, months ${MONTHS.join(',')}${DRY_RUN ? ' (DRY RUN)' : ''}\n`);

  const dates = MONTHS.flatMap(m => {
    const days = new Date(YEAR, m, 0).getDate();
    return Array.from({ length: days }, (_, i) =>
      `${YEAR}-${String(m).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
  });

  for (const date of dates) {
    const body = {
      context: 'SDECRPC',
      rpc: 'SDES CANCEL CLIN AVAILABILITY',
      jsonResult: true,
      parameters: [
        { string: CLINIC_IEN },
        { string: 'F' },
        { string: `${date}T00:00${TZ}` },
        { string: `${date}T21:00${TZ}` },
        { string: REASON }
      ]
    };

    if (DRY_RUN) {
      console.log(date, JSON.stringify(body.parameters.map(p => p.string)));
      continue;
    }

    try {
      const res = await axios.post(url, body, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          'X-OCTO-VistA-API': apiKey
        },
        httpsAgent,
        timeout: 30000
      });
      console.log(`${date}  ${res.status}  ${JSON.stringify(res.data.payload ?? res.data)}`);
    } catch (err) {
      console.error(`${date}  FAILED  ${err.response ? JSON.stringify(err.response.data) : err.message}`);
    }
  }
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
