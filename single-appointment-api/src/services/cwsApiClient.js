import axios from 'axios';
import { getToken, getDuzForSite } from './tokenService.js';

async function getCwsClient() {
  const baseUrl = process.env.CWS_API_BASE_URL;
  const siteId = process.env.VISTA_SITE_ID;
  if (!baseUrl) throw new Error('CWS_API_BASE_URL is not configured');
  if (!siteId) throw new Error('VISTA_SITE_ID is not configured');

  const token = await getToken();
  const duz = await getDuzForSite(siteId);
  return { baseUrl, siteId, duz, token };
}

async function getClinics() {
  const { baseUrl, siteId, duz, token } = await getCwsClient();
  const url = `${baseUrl}/vista-sites/${siteId}/users/${duz}/clinics`;

  console.log('[getClinics] GET', url);
  console.log('[getClinics] siteId:', siteId, '| duz:', duz);

  try {
    const response = await axios.get(url, {
      headers: {
        'x-vamf-jwt': token,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('[getClinics] Response status:', response.status, '| items:', Array.isArray(response.data?.data) ? response.data.data.length : '(non-array)');
    // Return the full response body — lookupService handles JSON:API unwrapping
    return response.data;
  } catch (err) {
    console.error('[getClinics] ERROR status:', err.response?.status);
    console.error('[getClinics] ERROR body:', JSON.stringify(err.response?.data, null, 2));
    console.error('[getClinics] ERROR message:', err.message);
    throw err;
  }
}

export { getClinics };
