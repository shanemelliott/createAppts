import { createOccJwtClient } from '@va/sts-token';
import path from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// STS configuration - check deployment location first, then dev location
function getStsExePath() {
  if (process.env.STS_EXE) {
    return process.env.STS_EXE;
  }
  // In deployment, exe is bundled in sts-token directory
  const deploymentPath = path.join(__dirname, '../../sts-token/sts-token-generator.exe');
  const devPath = path.join(__dirname, '../../token-server/sts-token-generator.exe');
  
  return existsSync(deploymentPath) ? deploymentPath : devPath;
}

const tokenCache = {
  token: null,
  expiresAt: 0,
  payload: null
};

let inflightRequest = null;
let occJwtClient = null;

// Initialize OCC JWT Client
async function initializeJwtClient(forceNew = false) {
  if (!occJwtClient || forceNew) {
    // Read config from env at runtime (after dotenv.config() has run)
    const STS_EXE_PATH = getStsExePath();
    const STS_ENV = process.env.STS_ENV || 'preprod';
    const PIV_SERIAL = process.env.PIV_SERIAL || undefined;
    
    console.log('[tokenService] Initializing JWT client with STS exe:', STS_EXE_PATH);
    console.log('[tokenService] Environment:', STS_ENV);
    
    const stsConfig = {
      provider: 'dotnet',
      exePath: STS_EXE_PATH,
      env: STS_ENV,
      serial: PIV_SERIAL,
      includeSaml: true  // Get SAML too so VistA client can use it from cache
    };
    
    occJwtClient = await createOccJwtClient({ sts: stsConfig });
  }
  return occJwtClient;
}

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
      const client = await initializeJwtClient();
      const token = await client.getOccJwt();
      
      if (!token) {
        throw new Error('Failed to get OCC JWT token');
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

// Clear JWT client cache (forces new token on next request)
export function clearJwtClient() {
  console.log('[tokenService] Clearing JWT client cache');
  if (occJwtClient) {
    try {
      occJwtClient.clearTokenCache();
      console.log('[tokenService] Token cache cleared');
    } catch (error) {
      console.error('[tokenService] Error clearing token cache:', error.message);
    }
  }
  occJwtClient = null;
  // Also clear local cache
  tokenCache.token = null;
  tokenCache.expiresAt = 0;
  tokenCache.payload = null;
}

export {
  getToken,
  getDuzForSite,
  getRequestUserNameFromJwt
};
