const { callRpc } = require('./vistaApiClient');
const cwsApiClient = require('./cwsApiClient');

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
    const caretIndex = line.indexOf('^');
    const dfn = line.slice(0, caretIndex);
    const name = line.slice(caretIndex + 1);
    return {
      dfn,
      name,
      display: `${name} (${dfn})`
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
  console.log('[getDefaultPatients] RPC result (first 500 chars):', JSON.stringify(result).slice(0, 500));
  const patients = parseDefaultPatients(result);
  console.log('[getDefaultPatients] Parsed patients count:', patients.length);
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

module.exports = {
  getClinics,
  getDefaultPatients,
  getClinicResourceByClinicIen,
  getClinicAvailability
};
