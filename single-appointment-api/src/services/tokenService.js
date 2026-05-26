const axios = require('axios');

const tokenCache = {
  token: null,
  expiresAt: 0,
  payload: null
};

let inflightRequest = null;

function parseJwtPayload(token) {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(payloadJson);
}

function pickFirstString(objectValue, keys) {
  for (const key of keys) {
    const value = objectValue && objectValue[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function toLastFirstFromPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const fromName = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (fromName && fromName.includes(',')) {
    const parts = fromName.split(',').map((p) => p.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]},${parts[1]}`;
    }
  }

  const lastName = pickFirstString(payload, [
    'lastName',
    'lastname',
    'family_name',
    'familyName',
    'surname',
    'sn'
  ]);

  const firstName = pickFirstString(payload, [
    'firstName',
    'firstname',
    'given_name',
    'givenName',
    'given'
  ]);

  if (lastName && firstName) {
    return `${lastName},${firstName}`;
  }

  return '';
}

function shouldRefreshToken() {
  if (!tokenCache.token) return true;
  if (!tokenCache.expiresAt) return true;

  const refreshBufferSeconds = 60;
  const now = Math.floor(Date.now() / 1000);
  return tokenCache.expiresAt <= now + refreshBufferSeconds;
}

async function getToken() {
  if (!shouldRefreshToken()) {
    return tokenCache.token;
  }

  // Deduplicate concurrent requests — return the same in-flight promise
  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = (async () => {
    try {
      const tokenServerUrl = process.env.TOKEN_SERVER_URL;
      if (!tokenServerUrl) {
        throw new Error('TOKEN_SERVER_URL is not configured');
      }

      const response = await axios.get(tokenServerUrl);
      const token = response.data && response.data.token;
      if (!token) {
        throw new Error('Token server response did not include token');
      }

      let expiresAt = 0;
      let payload = null;
      try {
        payload = parseJwtPayload(token);
        expiresAt = payload && payload.exp ? Number(payload.exp) : 0;
      } catch (err) {
        expiresAt = 0;
      }

      tokenCache.token = token;
      tokenCache.expiresAt = expiresAt;
      tokenCache.payload = payload;
      return token;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
}

async function getDuzForSite(siteId) {
  await getToken(); // ensure cache is populated
  const payload = tokenCache.payload;
  if (!payload || !Array.isArray(payload.vistaIds)) {
    throw new Error('JWT payload does not contain vistaIds');
  }
  const match = payload.vistaIds.find((v) => String(v.siteId) === String(siteId));
  if (!match) {
    throw new Error(`No vistaIds entry found for siteId ${siteId}`);
  }
  return String(match.duz);
}

async function getRequestUserNameFromJwt() {
  await getToken();
  return toLastFirstFromPayload(tokenCache.payload);
}

module.exports = {
  getToken,
  getDuzForSite,
  getRequestUserNameFromJwt
};
