const axios = require('axios');
const https = require('https');
const { getToken, getDuzForSite } = require('./tokenService');

const httpsAgent = new https.Agent({
  rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0'
});

function safeTrimmedString(value, maxLen = 1000) {
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  if (!raw) return '';
  return raw.length > maxLen ? `${raw.slice(0, maxLen)}...` : raw;
}

async function callRpc(rpcName, params, context = 'SDECRPC') {
  const baseUrl = process.env.VISTA_API_BASE_URL;
  const siteId = process.env.VISTA_SITE_ID;
  const apiKey = process.env.VISTA_API_KEY;
  if (!baseUrl) {
    throw new Error('VISTA_API_BASE_URL is not configured');
  }
  if (!siteId) {
    throw new Error('VISTA_SITE_ID is not configured');
  }
  if (!apiKey) {
    throw new Error('VISTA_API_KEY is not configured');
  }

  const token = await getToken();
  const userDuz = await getDuzForSite(siteId);

  const normalizedParameters = (params || []).map((value) => {
    if (value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'string')) {
      return value;
    }
    return { string: String(value ?? '') };
  });

  if (rpcName === 'SDEC APPADD') {
    console.log('[callRpc] SDEC APPADD request:', JSON.stringify({
      context,
      rpc: rpcName,
      parameters: normalizedParameters
    }));
  }

  let response;
  try {
    response = await axios.post(
      `${baseUrl}/vista-sites/${siteId}/users/${userDuz}/rpc/invoke`,
      {
        context,
        rpc: rpcName,
        jsonResult: false,
        parameters: normalizedParameters
      },
      {
        headers: {
          'Content-Type': 'application/json',
          authorization: `Bearer ${token}`,
          'X-OCTO-VistA-API': apiKey
        },
        httpsAgent,
        timeout: 30000
      }
    );
  } catch (err) {
    const upstreamStatus = err.response && err.response.status ? err.response.status : null;
    const upstreamBody = err.response ? err.response.data : null;

    const wrapped = new Error(
      `RPC ${rpcName} failed${upstreamStatus ? ` (${upstreamStatus})` : ''}: ${err.message}`
    );
    wrapped.status = upstreamStatus || 502;
    wrapped.details = {
      rpc: rpcName,
      context,
      upstreamStatus,
      upstreamBody: safeTrimmedString(upstreamBody)
    };
    throw wrapped;
  }

  // Vista-API-X returns { path: "...", payload: "..." }
  // Extract the payload if it exists
  if (response.data && typeof response.data === 'object' && response.data.payload !== undefined) {
    return response.data.payload;
  }

  return response.data;
}

module.exports = {
  callRpc
};
