const axios = require('axios');
const https = require('https');
const { getToken, getDuzForSite } = require('./tokenService');

const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
});

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

  const response = await axios.get(url, {
    headers: {
      'x-vamf-jwt': token,
      'Content-Type': 'application/json'
    },
    httpsAgent,
    timeout: 30000
  });

  // Return the full response body — lookupService handles JSON:API unwrapping
  return response.data;
}

module.exports = { getClinics };
