const { callRpc } = require('./vistaApiClient');
const { getRequestUserNameFromJwt } = require('./tokenService');

function validatePayload(payload) {
  const required = ['appointmentParams'];
  const missing = required.filter((key) => !payload[key]);
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(', ')}`);
    err.status = 400;
    throw err;
  }

  if (!payload.consultIen && !Array.isArray(payload.requestParams)) {
    const err = new Error('requestParams must be an array when consultIen is not provided');
    err.status = 400;
    throw err;
  }

  if (!Array.isArray(payload.appointmentParams)) {
    const err = new Error('appointmentParams must be an array');
    err.status = 400;
    throw err;
  }
}

function extractRequestIen(value) {
  if (value === null || value === undefined) return null;

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  if (typeof value === 'string') {
    // Handle Vista response format with record separator: \x1E<IEN>
    // Record separator is ASCII 30 (\x1E or \u001e)
    const recordSepMatch = value.match(/\x1E(\d+)/);
    if (recordSepMatch && recordSepMatch[1]) {
      return recordSepMatch[1];
    }

    // Handle A|<IEN> format
    const prefixed = value.match(/A\|(\d+)/i);
    if (prefixed) return prefixed[1];

    // Handle caret/pipe delimited format
    const caretOrPipe = value.match(/(^|\^|\|)(\d{1,12})(\^|\||$)/);
    if (caretOrPipe) return caretOrPipe[2];

    // Fallback to any number up to 12 digits
    const fallback = value.match(/\d{1,12}/);
    return fallback ? fallback[0] : null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const found = extractRequestIen(item);
      if (found) return found;
    }
    return null;
  }

  if (typeof value === 'object') {
    for (const objectValue of Object.values(value)) {
      const found = extractRequestIen(objectValue);
      if (found) return found;
    }
  }

  return null;
}

function formatAppointmentDateTime(date) {
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[date.getMonth()];
  const day = String(date.getDate()).padStart(2, '0');
  const year = date.getFullYear();
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${month} ${day}, ${year}@${hour}:${minute}`;
}

function ensureAppointmentParamsComplete(params) {
  // Ensure params is 25 elements with all required fields per Vista APPADD RPC
  // Reference: brunoRequest Samples.md - SDEC APPADD specification
  const normalized = [...params];
  while (normalized.length < 25) {
    normalized.push('');
  }

  // Piece 1 (index 0): Start DateTime - must be MON DD, YYYY@HH:MM format
  if (!normalized[0] || !normalized[0].trim()) {
    const now = new Date();
    now.setHours(now.getHours() + 2); // Schedule 2 hours from now
    normalized[0] = formatAppointmentDateTime(now);
  }

  // Piece 2 (index 1): End DateTime - auto-calculate if not set
  if (!normalized[1] || !normalized[1].trim()) {
    const startParts = normalized[0].split('@');
    if (startParts.length === 2) {
      const timeParts = startParts[1].split(':');
      if (timeParts.length === 2) {
        let hour = parseInt(timeParts[0], 10) + 1;
        if (hour >= 24) hour = 0;
        const datePart = startParts[0];
        const minute = timeParts[1];
        normalized[1] = `${datePart}@${String(hour).padStart(2, '0')}:${minute}`;
      }
    }
  }

  // Piece 5 (index 4): Duration in minutes - DEFAULT 60 if not set
  if (!normalized[4] || !normalized[4].trim()) {
    normalized[4] = '60';
  }

  // Piece 6 (index 5): Note - leave as is
  // Piece 7 (index 6): Access type ID - default 0
  if (!normalized[6] || !normalized[6].trim()) {
    normalized[6] = '0';
  }

  // Piece 8 (index 7): Print routing slip - default 0
  if (!normalized[7] || !normalized[7].trim()) {
    normalized[7] = '0';
  }

  // Piece 9 (index 8): Multiple appointments - default FALSE
  if (!normalized[8] || !normalized[8].trim()) {
    normalized[8] = 'FALSE';
  }

  // Piece 11 (index 10): Requested by - default PATIENT
  if (!normalized[10] || !normalized[10].trim()) {
    normalized[10] = 'PATIENT';
  }

  // Piece 16 (index 15): Service connected - default YES
  if (!normalized[15] || !normalized[15].trim()) {
    normalized[15] = 'YES';
  }

  // Piece 21 (index 20): Appointment type ID - default 11
  if (!normalized[20] || !normalized[20].trim()) {
    normalized[20] = '11';
  }

  // Piece 22 (index 21): New/Established - default ESTABLISHED
  if (!normalized[21] || !normalized[21].trim()) {
    normalized[21] = 'ESTABLISHED';
  }

  // Piece 23 (index 22): Overbook flag - default 0 (no overbook)
  if (!normalized[22] || !normalized[22].trim()) {
    normalized[22] = '0';
  }

  // Piece 25 (index 24): Eligibility code - default 16
  if (!normalized[24] || !normalized[24].trim()) {
    normalized[24] = '16';
  }

  return normalized;
}

function parseAppAddPayload(payload) {
  if (typeof payload !== 'string' || !payload.trim()) return null;

  const rows = payload.split(String.fromCharCode(30)).filter(Boolean);
  if (rows.length < 2) return null;

  const dataRow = rows[1].replace(new RegExp(String.fromCharCode(31), 'g'), '').trim();
  if (!dataRow) return null;

  const pieces = dataRow.split('^');
  if (pieces.length < 2) return null;

  return {
    appointmentId: String(pieces[0] || '').trim(),
    errorId: String(pieces[1] || '').trim()
  };
}

async function createAppointmentFlow(payload) {
  validatePayload(payload);

  const requestRpcName = 'SDEC ARSET';
  const createApptRpcName = 'SDEC APPADD';

  const requestParams = Array.isArray(payload.requestParams) ? [...payload.requestParams] : [];
  const appointmentParams = ensureAppointmentParamsComplete(payload.appointmentParams);
  const consultIen = String(payload.consultIen || '').trim();

  console.log('[createAppointmentFlow] APPADD params piece 3 (patient):', appointmentParams[2]);
  console.log('[createAppointmentFlow] APPADD params piece 5 (duration):', appointmentParams[4]);
  console.log('[createAppointmentFlow] APPADD params piece 15 (appt type):', appointmentParams[14]);

  let requestResult = null;
  let requestIen = null;

  if (consultIen) {
    // For consult-based appointment flow, skip ARSET and point SDAPTYP directly to consult.
    appointmentParams[14] = `C|${consultIen}`;
    console.log('[createAppointmentFlow] APPADD piece 15 set from consult IEN:', appointmentParams[14]);
  } else {
    while (requestParams.length < 7) {
      requestParams.push('');
    }

    const jwtRequestUser = await getRequestUserNameFromJwt();
    if (jwtRequestUser) {
      requestParams[6] = jwtRequestUser;
    }

    console.log('[createAppointmentFlow] ARSET params piece 2 (patient):', requestParams[1]);
    console.log('[createAppointmentFlow] ARSET params piece 7 (request user):', requestParams[6]);

    requestResult = await callRpc(requestRpcName, requestParams);
    requestIen = extractRequestIen(requestResult);
    if (!requestIen) {
      const err = new Error('Could not parse appointment request IEN from SDEC ARSET response');
      err.status = 502;
      throw err;
    }

    console.log('[createAppointmentFlow] ARSET success, request IEN:', requestIen);

    // Piece 15 (index 14) in APPADD is SDAPTYP and must carry A|<requestIEN>
    appointmentParams[14] = `A|${requestIen}`;
    console.log('[createAppointmentFlow] APPADD piece 15 (after setting request IEN):', appointmentParams[14]);
  }

  console.log('[createAppointmentFlow] APPADD payload params:', JSON.stringify(appointmentParams));

  const appointmentResult = await callRpc(createApptRpcName, appointmentParams);
  const appAddParsed = parseAppAddPayload(appointmentResult);
  if (appAddParsed && appAddParsed.appointmentId === '0' && appAddParsed.errorId) {
    const err = new Error(`SDEC APPADD rejected request: ${appAddParsed.errorId}`);
    err.status = 409;
    err.details = {
      rpc: createApptRpcName,
      appAdd: appAddParsed,
      appAddParams: appointmentParams
    };
    throw err;
  }

  return {
    success: true,
    requestIen,
    request: requestResult,
    appointment: appointmentResult
  };
}

module.exports = {
  createAppointmentFlow
};
