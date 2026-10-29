import { callRpc } from './vistaApiClient.js';
import * as cwsApiClient from './cwsApiClient.js';

function findFirstString(value) {
  if (typeof value === 'string') {
    return value;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findFirstString(item);
      if (found !== null) return found;
    }
    return null;
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = findFirstString(item);
      if (found !== null) return found;
    }
  }

  return null;
}

function parseClinics(rawResult) {
  const payload = findFirstString(rawResult) || '';
  const rows = payload.split(String.fromCharCode(30)).filter((line) => line && line.trim());

  if (rows.length === 0) return [];

  const rawHeaders = rows[0].split('^');
  const headers = rawHeaders.map((header) => (header.length > 6 ? header.slice(6) : header));

  const clinics = [];
  for (let i = 1; i < rows.length; i += 1) {
    const pieces = rows[i].split('^');
    const row = {};

    headers.forEach((header, index) => {
      row[header] = pieces[index] || '';
    });

    const clinicName = row.CLINNAME || row.RESOURCE_NAME || row.NAME || '';
    const clinicIen = row.CLINIC_IEN || row.CLINIC || row.CLINIEN || row.HOSPITAL_LOCATION_ID || '';
    const resourceIen = row.RESOURCE_IEN || row.RESOURCE || row.RESIEN || row.IEN || '';

    clinics.push({
      clinicName,
      clinicIen: String(clinicIen),
      resourceIen: String(resourceIen),
      raw: row
    });
  }

  return clinics.filter((item) => item.clinicName);
}

function parseDefaultPatients(rawResult) {
  const payload = findFirstString(rawResult) || '';
  const rows = payload
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^\d+\^/.test(line));

  return rows.map((line) => {
    const parts = line.split('^');
    const dfn = parts[0];
    // Format is: DFN^NAME^^^^DISPLAY_NAME
    // Get the last non-empty part which is the clean display name
    const displayName = parts[parts.length - 1] || parts[1] || '';
    return {
      dfn,
      name: displayName,
      display: `${displayName} (${dfn})`
    };
  });
}

async function getClinics() {
  const raw = await cwsApiClient.getClinics();
  // CWS returns JSON:API format: { data: [{ id, type, attributes: { clinicIen, resourceIen, name, stationId } }] }
  const items = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.data) ? raw.data : []);
  return items.map((item) => {
    const attr = item.attributes || item;
    return {
      clinicName: attr.name || '',
      clinicIen: String(attr.clinicIen || item.id || ''),
      resourceIen: String(attr.resourceIen || ''),
      raw: item
    };
  }).filter(c => c.clinicName);
}

async function getDefaultPatients() {
  const result = await callRpc('ORQPT DEFAULT PATIENT LIST', [], 'OR CPRS GUI CHART');
  const patients = parseDefaultPatients(result);
  console.log('[getDefaultPatients] Parsed patients count:', patients.length);
  return patients;
}

async function searchPatients(partialName) {
  // Append @~ to the partial name as required by the RPC
  // Force to uppercase as required by VistA
  const searchTerm = `${partialName.toUpperCase()}@~`;
  console.log('[searchPatients] Calling RPC with params:', {
    rpc: 'ORWPT LIST ALL',
    params: [searchTerm, '1'],
    context: 'OR CPRS GUI CHART'
  });
  const result = await callRpc('ORWPT LIST ALL', [searchTerm, '1'], 'OR CPRS GUI CHART');
  console.log('[searchPatients] RPC result:', result);
  const patients = parseDefaultPatients(result);
  console.log('[searchPatients] Parsed patients count:', patients.length);
  return patients;
}

function findResourceIenInClinicPayload(value) {
  if (!value) return null;

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findResourceIenInClinicPayload(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    const candidateKeys = ['ResourceIEN', 'ResourceIen', 'RESOURCE_IEN', 'Resource', 'RESOURCE'];
    for (const key of candidateKeys) {
      if (Object.prototype.hasOwnProperty.call(value, key) && value[key] !== '' && value[key] !== null) {
        return String(value[key]);
      }
    }

    for (const nested of Object.values(value)) {
      const found = findResourceIenInClinicPayload(nested);
      if (found) return found;
    }
  }

  return null;
}

async function getClinicResourceByClinicIen(clinicIen) {
  const infoResult = await callRpc('SDES GET CLINIC INFO2', [String(clinicIen)]);
  let resourceIen = findResourceIenInClinicPayload(infoResult);

  if (!resourceIen) {
    const clinics = await getClinics();
    const byClinic = clinics.find((item) => String(item.clinicIen) === String(clinicIen));
    resourceIen = byClinic ? byClinic.resourceIen : null;
  }

  return {
    clinicIen: String(clinicIen),
    resourceIen: resourceIen ? String(resourceIen) : ''
  };
}

function formatYyyyMmDdToMmDdYy(dateStr) {
  const match = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD');
  }

  const year = match[1].slice(2);
  const month = match[2];
  const day = match[3];
  return `${month}${day}${year}`;
}

function parseFilemanDate(filemanDate) {
  const raw = String(filemanDate || '').trim();
  if (!/^\d{7,}$/.test(raw)) return null;

  const yyyy = 1700 + Number(raw.slice(0, 3));
  const mm = Number(raw.slice(3, 5));
  const dd = Number(raw.slice(5, 7));

  if (!Number.isFinite(yyyy) || !Number.isFinite(mm) || !Number.isFinite(dd)) return null;
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  return { year: yyyy, month: mm, day: dd };
}

function normalizeTimeHhmm(value) {
  const digits = String(value || '').replace(/\D/g, '');
  const hhmm = digits.padStart(4, '0').slice(0, 4);
  const hh = Number(hhmm.slice(0, 2));
  const mm = Number(hhmm.slice(2, 4));
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || hh > 23 || mm > 59) return null;
  return hhmm;
}

function toLocalIsoString(parts, hhmm) {
  if (!parts || !hhmm) return '';
  const date = new Date(parts.year, parts.month - 1, parts.day, Number(hhmm.slice(0, 2)), Number(hhmm.slice(2, 4)), 0);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}`;
}

function decodeAvailabilityCode(code) {
  if (!code) return { available: false, slotsAvail: 0 };

  if (/^[0-9]$/.test(code)) {
    return { available: Number(code) > 0, slotsAvail: Number(code) };
  }

  if (/^[j-z]$/.test(code)) {
    return { available: true, slotsAvail: code.charCodeAt(0) - 'j'.charCodeAt(0) + 10 };
  }

  if (/^[A-W]$/.test(code)) {
    return { available: false, slotsAvail: 0 };
  }

  return { available: false, slotsAvail: 0 };
}

function parseAppSlotsPayload(payload) {
  const rows = String(payload || '').split(String.fromCharCode(30)).filter(Boolean);
  if (rows.length <= 1) return [];

  const slots = [];
  for (let i = 1; i < rows.length; i += 1) {
    const row = rows[i].replace(new RegExp(String.fromCharCode(31), 'g'), '').trim();
    if (!row) continue;

    const parts = row.split('^');
    if (parts.length < 4) continue;

    const fmDate = parseFilemanDate(parts[0]);
    const startHhmm = normalizeTimeHhmm(parts[1]);
    const endHhmm = normalizeTimeHhmm(parts[2]);
    const availabilityCode = String(parts[3] || '').trim();

    if (!fmDate || !startHhmm || !endHhmm) continue;

    const decoded = decodeAvailabilityCode(availabilityCode);

    slots.push({
      beginTime: toLocalIsoString(fmDate, startHhmm),
      endTime: toLocalIsoString(fmDate, endHhmm),
      available: decoded.available,
      slotsAvail: decoded.slotsAvail,
      availabilityCode
    });
  }

  return slots;
}

async function getClinicAvailability(clinicIen, dateStr) {
  const mmddyy = formatYyyyMmDdToMmDdYy(dateStr);
  const resolved = await getClinicResourceByClinicIen(clinicIen);
  const resourceIen = String(resolved.resourceIen || '').trim();

  let payload;
  if (resourceIen) {
    try {
      payload = await callRpc('SDEC APPSLOTS', [resourceIen, mmddyy, mmddyy], 'SDECRPC');
    } catch (resourceErr) {
      payload = await callRpc('SDEC APPSLOTS', [String(clinicIen), mmddyy, mmddyy], 'SDECRPC');
    }
  } else {
    payload = await callRpc('SDEC APPSLOTS', [String(clinicIen), mmddyy, mmddyy], 'SDECRPC');
  }

  return parseAppSlotsPayload(payload);
}

function parseJsonRpcResult(raw) {
  if (Array.isArray(raw) && raw.every((part) => typeof part === 'string')) {
    raw = raw.join('');
  }
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

// Looks for file #2 field .134 (PHONE NUMBER [CELLULAR]) under any likely key name.
function findCellPhone(value) {
  if (!value || typeof value !== 'object') return null;

  for (const [key, val] of Object.entries(value)) {
    if (val !== null && typeof val !== 'object' && (/^\.?134$/.test(key) || /cell/i.test(key))) {
      return String(val);
    }
  }

  for (const val of Object.values(value)) {
    if (val && typeof val === 'object') {
      const found = findCellPhone(val);
      if (found !== null) return found;
    }
  }

  return null;
}

async function getPatientCellPhone(dfn) {
  const raw = await callRpc('SDES GET PATIENT REGISTRATION2', [String(dfn)], 'SDECRPC', { jsonResult: true });
  const result = parseJsonRpcResult(raw);

  if (result && typeof result === 'object' && result.ERROR) {
    const err = new Error(result.ERROR);
    err.status = 502;
    throw err;
  }

  const cell = result?.Patient?.Cell;
  const cellPhone = cell !== undefined && cell !== null && cell !== '' ? String(cell) : findCellPhone(result) || '';
  return { dfn: String(dfn), cellPhone, raw: result };
}

async function setPatientCellPhone(dfn, cellPhone) {
  const raw = await callRpc(
    'CDSP UTIL VET SET',
    [String(dfn), { namedArray: { 1: `F^.134^${cellPhone}` } }, '1'],
    'CDSP RPC UTILS',
    { jsonResult: true }
  );
  const result = parseJsonRpcResult(raw);

  const changes = (result && Array.isArray(result.changes)) ? result.changes : [];
  const itemErrors = changes
    .filter((change) => typeof change.status === 'string' && change.status.startsWith('error'))
    .map((change) => `${change.label || change.field || change.item}: ${change.status}`);

  const topError = result && typeof result === 'object'
    ? (result.ERROR || (Number(result.errors) > 0 && itemErrors.length === 0 ? `${result.errors} error(s)` : ''))
    : 'Unexpected response from CDSP UTIL VET SET';

  if (topError || itemErrors.length) {
    const err = new Error(topError || itemErrors.join('; '));
    err.status = 422;
    err.details = result;
    throw err;
  }

  return { dfn: String(dfn), cellPhone, result };
}

// Payload rows run together when the record separator is stripped, so split on the DATE^START^END^ prefix instead.
function parseOpenSlots(payload) {
  const body = String(payload || '')
    .replace(/[\x1e\x1f]/g, '')
    .replace(/^[\s\S]*?AVAILABILITY/, '');

  const rowRegex = /(\d{7})\^(\d{4})\^(\d{4})\^([\s\S]*?)(?=\d{7}\^\d{4}\^\d{4}\^|$)/g;
  const byDate = new Map();

  for (const match of body.matchAll(rowRegex)) {
    const parts = parseFilemanDate(match[1]);
    if (!parts) continue;

    const date = `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
    const code = match[4].trim();
    const decoded = decodeAvailabilityCode(code);

    if (!byDate.has(date)) {
      const weekday = new Date(parts.year, parts.month - 1, parts.day)
        .toLocaleDateString('en-US', { weekday: 'short' });
      byDate.set(date, { date, label: weekday, slots: [], openSlots: 0 });
    }
    const day = byDate.get(date);
    // Empty code = time block with no slots; symbols (*, $, !, @, #, A-W) = overbook / outside hours.
    day.slots.push({
      start: match[2],
      end: match[3],
      code,
      open: /^[0-9j-z]$/.test(code) ? decoded.slotsAvail : null
    });
    day.openSlots += decoded.slotsAvail;
  }

  return [...byDate.values()];
}

async function getClinicOpenSlots(clinicIen, startIso, endIso) {
  const resolved = await getClinicResourceByClinicIen(clinicIen);
  const resourceIen = String(resolved.resourceIen || clinicIen);

  const raw = await callRpc('SDEC APPSLOTS', [resourceIen, startIso, endIso], 'SDECRPC', { jsonResult: false });
  const payload = typeof raw === 'string' ? raw : findFirstString(raw) || '';
  return { resourceIen, days: parseOpenSlots(payload), raw: payload };
}

export {
  getClinics,
  getDefaultPatients,
  searchPatients,
  getClinicResourceByClinicIen,
  getClinicAvailability,
  getPatientCellPhone,
  setPatientCellPhone,
  getClinicOpenSlots,
  parseOpenSlots
};
