import { callRpc } from './vistaApiClient.js';

const APPTS_BY_DFN_RPC = 'SDES GET APPTS BY PATIENT DFN3';

function pad2(value) {
  return String(value).padStart(2, '0');
}

// RPC expects local wall time with an explicit UTC offset, e.g. 2026-03-02T00:00-04:00
function toRpcDateTime(dateStr, hhmm) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateStr || '').trim());
  if (!match) {
    const err = new Error(`Invalid date "${dateStr}"; expected YYYY-MM-DD`);
    err.status = 400;
    throw err;
  }

  const [, year, month, day] = match;
  const [hours, minutes] = String(hhmm).split(':');
  const local = new Date(Number(year), Number(month) - 1, Number(day), Number(hours), Number(minutes), 0);
  if (Number.isNaN(local.getTime())) {
    const err = new Error(`Invalid date "${dateStr}"`);
    err.status = 400;
    throw err;
  }

  const offsetMinutes = -local.getTimezoneOffset();
  const sign = offsetMinutes < 0 ? '-' : '+';
  const absolute = Math.abs(offsetMinutes);

  return `${year}-${month}-${day}T${pad2(hours)}:${pad2(minutes)}${sign}${pad2(Math.floor(absolute / 60))}:${pad2(absolute % 60)}`;
}

function parsePayload(payload) {
  if (payload === null || payload === undefined || payload === '') {
    return null;
  }
  if (typeof payload !== 'string') {
    return payload;
  }
  try {
    return JSON.parse(payload);
  } catch (err) {
    return payload;
  }
}

function extractAppointments(parsed) {
  if (Array.isArray(parsed)) {
    return parsed;
  }
  if (!parsed || typeof parsed !== 'object') {
    return [];
  }

  const candidateKeys = ['Appointments', 'appointments', 'Appointment', 'appointment', 'Data', 'data', 'Results', 'results'];
  for (const key of candidateKeys) {
    const value = parsed[key];
    if (Array.isArray(value)) {
      return value;
    }
    if (value && typeof value === 'object') {
      const nested = extractAppointments(value);
      if (nested.length) {
        return nested;
      }
    }
  }
  return [];
}

async function getPatientAppointments({ dfn, startDate, endDate }) {
  const patientDfn = String(dfn || '').trim();
  if (!patientDfn) {
    const err = new Error('dfn is required');
    err.status = 400;
    throw err;
  }

  const start = toRpcDateTime(startDate, '00:00');
  const end = toRpcDateTime(endDate, '23:59');

  const payload = await callRpc(
    APPTS_BY_DFN_RPC,
    [patientDfn, start, end],
    'SDECRPC',
    { jsonResult: true }
  );

  const parsed = parsePayload(payload);
  return {
    start,
    end,
    appointments: extractAppointments(parsed),
    raw: parsed
  };
}

export {
  getPatientAppointments
};
