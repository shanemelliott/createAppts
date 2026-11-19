import {
  addDays, fromFileman, hhmmToMinutes, minutesToHhmm, toIso, toMdy, utcOffset, vistaDateTime
} from '../dates.js';

const RS = '\u001e';
const US = '\u001f';

export class ScenarioError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.details = details;
  }
}

// SDEC global-array replies: header "I00020NAME^T00030NAME..." then RS-separated rows, terminated by US.
export function parseSdecRows(raw) {
  const rows = String(raw || '').split(RS).map((r) => r.replace(new RegExp(US, 'g'), '')).filter((r) => r.trim() !== '');
  if (!rows.length) return { headers: [], rows: [] };
  const headers = rows[0].split('^').map((h) => (h.length > 6 ? h.slice(6) : h));
  const data = rows.slice(1).map((r) => {
    const pieces = r.split('^');
    const obj = { pieces };
    headers.forEach((h, i) => { obj[h] = pieces[i] ?? ''; });
    return obj;
  });
  return { headers, rows: data };
}

function firstDataRow(raw) {
  const { rows } = parseSdecRows(raw);
  return rows[0]?.pieces || [];
}

// ---------- Clinics ----------

export async function loadResources(rpc) {
  const { rows } = parseSdecRows(await rpc.call('SDEC RESCE', ['']));
  return rows.map((r) => ({
    clinicIen: String(r.HOSPITAL_LOCATION_ID || ''),
    resourceIen: String(r.RESOURCEID || ''),
    name: r.CLINNAME || r.RESOURCE_NAME || ''
  })).filter((r) => r.clinicIen && r.resourceIen);
}

export async function resolveClinic(ctx, clinicIen) {
  ctx.cache = ctx.cache || {};
  ctx.cache.resources = ctx.cache.resources || await loadResources(ctx.rpc);
  const match = ctx.cache.resources.find((r) => r.clinicIen === String(clinicIen));
  if (!match) throw new ScenarioError(`Clinic ${clinicIen} has no scheduling resource (not found in SDEC RESCE)`);
  return { ...match, duration: await clinicDuration(ctx.rpc, clinicIen) };
}

function findLength(value) {
  if (!value || typeof value !== 'object') return null;
  for (const [key, val] of Object.entries(value)) {
    if (/length.*app|app.*length/i.test(key) && /^\d+$/.test(String(val))) return Number(val);
  }
  for (const val of Object.values(value)) {
    const found = findLength(val);
    if (found) return found;
  }
  return null;
}

// Appointment length from SDES GET CLINIC INFO2; null means "derive from slot blocks".
export async function clinicDuration(rpc, clinicIen) {
  try {
    return findLength(JSON.parse(await rpc.call('SDES GET CLINIC INFO2', [String(clinicIen)])));
  } catch {
    return null;
  }
}

// ---------- Slots ----------

export function decodeOpenCount(code) {
  if (/^[0-9]$/.test(code)) return Number(code);
  if (/^[j-z]$/.test(code)) return code.charCodeAt(0) - 'j'.charCodeAt(0) + 10;
  return 0;
}

// Rows can run together when separators are stripped, so split on the FMDATE^HHMM^HHMM^ prefix.
export function parseAppSlots(raw) {
  const body = String(raw || '').replace(/[\x1e\x1f]/g, '').replace(/^[\s\S]*?AVAILABILITY/, '');
  const rowRegex = /(\d{7})\^(\d{4})\^(\d{4})\^([\s\S]*?)(?=\d{7}\^\d{4}\^\d{4}\^|$)/g;
  const blocks = [];
  for (const m of body.matchAll(rowRegex)) {
    const day = fromFileman(m[1]);
    if (!day) continue;
    const code = m[4].trim();
    blocks.push({ day, start: m[2], end: m[3], code, open: decodeOpenCount(code) });
  }
  return blocks;
}

export async function getSlotBlocks(rpc, resourceIen, fromDay, toDay) {
  return parseAppSlots(await rpc.call('SDEC APPSLOTS', [String(resourceIen), toIso(fromDay), toIso(toDay)]));
}

export function openBlocks(blocks) {
  return blocks.filter((b) => b.open > 0);
}

export function slotDuration(clinic, blocks) {
  if (clinic.duration) return clinic.duration;
  const lengths = openBlocks(blocks).map((b) => hhmmToMinutes(b.end) - hhmmToMinutes(b.start)).filter((n) => n > 0);
  return lengths.length ? Math.min(...lengths) : 30;
}

// Candidate start times, in chronological order. Contiguous open rows are merged first because
// APPSLOTS rows follow the clinic increment (e.g. 15 min) while appointments can be longer (e.g. 30 min).
export function candidateSlots(blocks, duration, { notBefore } = {}) {
  const sorted = [...openBlocks(blocks)].sort((a, b) => (toIso(a.day) + a.start).localeCompare(toIso(b.day) + b.start));
  const runs = [];
  for (const b of sorted) {
    const start = hhmmToMinutes(b.start);
    const end = hhmmToMinutes(b.end);
    const last = runs[runs.length - 1];
    if (last && toIso(last.day) === toIso(b.day) && last.end === start) {
      last.end = end;
      last.step = Math.min(last.step, end - start);
    } else {
      runs.push({ day: b.day, start, end, step: end - start });
    }
  }

  const out = [];
  for (const run of runs) {
    const step = Math.max(1, Math.min(duration, run.step));
    for (let t = run.start; t + duration <= run.end; t += step) {
      const cand = { day: run.day, start: minutesToHhmm(t), end: minutesToHhmm(t + duration), duration };
      if (notBefore && toIso(cand.day) === toIso(notBefore.day) && cand.start <= notBefore.hhmm) continue;
      out.push(cand);
    }
  }
  return out;
}

export function overlaps(a, b) {
  return toIso(a.day) === toIso(b.day)
    && hhmmToMinutes(a.start) < hhmmToMinutes(b.end)
    && hhmmToMinutes(b.start) < hhmmToMinutes(a.end);
}

// ---------- Patients ----------

export async function pickRandomPatient(rpc, random = Math.random) {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const letter = letters.charAt(Math.floor(random() * letters.length));
    const { rows } = parseSdecRows(await rpc.call('SDEC GET PATIENT DEMOG', [letter, '50', '']));
    const patients = rows.filter((r) => /^\d+$/.test(r.IEN || ''));
    if (patients.length) {
      const p = patients[Math.floor(random() * patients.length)];
      return { dfn: p.IEN, name: p.NAME || p.PATIENT_NAME || '' };
    }
  }
  throw new ScenarioError('Could not find a random test patient (SDEC GET PATIENT DEMOG returned no patients); pass --dfn');
}

// ---------- Appointment request (SDEC ARSET) ----------

export function buildArsetParams({ dfn, requestDateTime, institution, clinicIen, duz, desiredDay, comment }) {
  const p = new Array(29).fill('');
  p[1] = String(dfn);
  p[2] = requestDateTime;
  p[3] = institution || '';
  p[4] = 'APPT';
  p[5] = String(clinicIen);
  p[6] = String(duz);
  p[7] = 'ASAP';
  p[8] = 'PATIENT';
  p[10] = toMdy(desiredDay);
  p[11] = comment || '';
  p[12] = 'GROUP 1'; // enrollment priority
  p[13] = 'NO'; // multiple appointment RTC
  p[17] = 'YES'; // service connected priority
  p[21] = '11'; // appointment type
  p[22] = 'ESTABLISHED';
  // p[24] parent request intentionally empty
  return p;
}

export function parseArsetResponse(raw) {
  const [ien, text] = firstDataRow(raw);
  if (/^\d+$/.test(ien || '') && Number(ien) > 0) return ien;
  throw new ScenarioError(`SDEC ARSET failed: ${text || ien || String(raw).replace(/[\x00-\x1f]/g, ' ').trim()}`);
}

// ---------- Appointment (SDEC APPADD) ----------

export function buildAppaddParams({ slot, dfn, resourceIen, clinicIen, desiredDay, requestIen }) {
  const p = new Array(25).fill('');
  p[0] = vistaDateTime(slot.day, slot.start);
  p[1] = vistaDateTime(slot.day, slot.end);
  p[2] = String(dfn);
  p[3] = String(resourceIen);
  p[4] = String(slot.duration);
  p[6] = '0';
  p[7] = '0';
  p[8] = 'FALSE';
  p[9] = toMdy(desiredDay);
  p[10] = 'PATIENT';
  p[14] = `A|${requestIen}`;
  p[15] = 'YES';
  p[17] = String(clinicIen);
  p[20] = '11';
  p[21] = 'ESTABLISHED';
  p[22] = '0'; // never overbook
  // p[23] parent request intentionally empty
  p[24] = '16';
  return p;
}

export function parseAppaddResponse(raw) {
  const [id, text] = firstDataRow(raw);
  if (/^\d+$/.test(id || '') && Number(id) > 0) return { ok: true, appointmentId: id };
  return { ok: false, error: text || id || String(raw).replace(/[\x00-\x1f]/g, ' ').trim() || 'empty response' };
}

// ---------- Cleanup (SDEC APPDEL / SDEC ARCLOSE) ----------

export function buildAppdelParams(appointmentId, duz) {
  // SDF=2 (position 8): do not reopen; the request is closed as REMOVED/EXTERNAL APP.
  return [String(appointmentId), 'C', '', 'appt-scenario cleanup', '', String(duz), '', '2'];
}

export function parseAppdelResponse(raw) {
  const [first, text] = firstDataRow(raw);
  const failed = (text && text.trim()) || String(first || '').startsWith('-');
  return failed ? { ok: false, error: text || first } : { ok: true };
}

export function buildArcloseParams(requestIen, dispositionIen, duz) {
  return [String(requestIen), String(dispositionIen), String(duz)];
}

export function parseArcloseResponse(raw) {
  const value = String(raw || '').replace(/[\x00-\x1f]/g, '').trim();
  if (/^-\d/.test(value) || !value) return { ok: false, error: value.split('^').slice(1).join('^') || value || 'empty response' };
  return { ok: true };
}

// ---------- Clinic availability (SDES CANCEL CLIN AVAILABILITY) ----------

export function buildCancelAvailabilityParams(clinicIen, day, tz, reason) {
  const iso = toIso(day);
  return [
    String(clinicIen),
    'F',
    `${iso}T00:00${utcOffset(day, '0000', tz)}`,
    `${iso}T21:00${utcOffset(day, '2100', tz)}`,
    reason
  ];
}

function findErrorText(value) {
  if (!value || typeof value !== 'object') return '';
  for (const [key, val] of Object.entries(value)) {
    if (/^err/i.test(key)) {
      if (typeof val === 'string' && val.trim()) return val;
      if (Array.isArray(val) && val.length) return val.map((v) => (typeof v === 'string' ? v : JSON.stringify(v))).join('; ');
      if (val && typeof val === 'object' && Object.keys(val).length) return JSON.stringify(val);
    }
  }
  return '';
}

export function parseCancelAvailabilityResponse(raw) {
  const text = String(raw || '').trim();
  try {
    const error = findErrorText(JSON.parse(text));
    return error ? { ok: false, error, raw: text } : { ok: true, raw: text };
  } catch {
    return /^-\d/.test(text) ? { ok: false, error: text, raw: text } : { ok: true, raw: text };
  }
}

export function dayRange(fromDay, toDay) {
  const out = [];
  for (let d = fromDay; toIso(d) <= toIso(toDay); d = addDays(d, 1)) out.push(d);
  return out;
}
