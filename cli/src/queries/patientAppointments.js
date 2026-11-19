import { formatZoned, toIso, utcOffset } from '../dates.js';
import { ScenarioError } from '../vista/scheduling.js';

const RPC = 'SDES GET APPTS BY PATIENT DFN3';
const LIST_KEYS = ['Appointment', 'Appointments', 'appointments', 'Data', 'data', 'Results', 'results'];

// Local wall time with that date's UTC offset, e.g. 2026-11-18T00:00-05:00.
export function buildApptsParams(dfn, fromDay, toDay, tz) {
  const stamp = (day, hhmm) => `${toIso(day)}T${hhmm.slice(0, 2)}:${hhmm.slice(2)}${utcOffset(day, hhmm, tz)}`;
  return [String(dfn), stamp(fromDay, '0000'), stamp(toDay, '2359')];
}

function text(value) {
  if (value === null || value === undefined) return '';
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(', ');
  if (typeof value === 'object') return text(value.Name ?? value.name ?? '');
  return String(value).trim();
}

function errorText(value) {
  if (!value) return '';
  if (Array.isArray(value)) return value.map(errorText).filter(Boolean).join('; ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value).trim();
}

function extractList(parsed) {
  if (Array.isArray(parsed)) return parsed;
  if (!parsed || typeof parsed !== 'object') return [];
  for (const key of LIST_KEYS) {
    const value = parsed[key];
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') {
      const nested = extractList(value);
      if (nested.length) return nested;
    }
  }
  return [];
}

// The reply carries offsets without a colon (2026-11-18T07:00-0500).
function parseInstant(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2'));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function normalizeAppointment(raw, tz) {
  const instant = parseInstant(raw.AppointmentDateTime);
  const clinic = raw.Clinic && typeof raw.Clinic === 'object' ? raw.Clinic : {};
  return {
    ien: text(raw.AppointmentIEN),
    dateTime: instant ? formatZoned(instant, tz) : text(raw.AppointmentDateTime),
    clinicName: text(raw.Clinic) || text(raw.Resource),
    clinicIen: text(clinic.ClinicIEN),
    status: text(raw.CurrentStatus) || text(raw.Status),
    scheduledBy: text(raw.DataEntryClerk) || text(raw.SchedulerName),
    cancelledBy: text(raw.CancelledByUser) || text(raw.NoShowCancelledBy),
    cancelDateTime: text(raw.CancelDateTime),
    requestIen: text(raw.RequestIEN),
    lengthMinutes: raw.LengthOfAppt === undefined ? null : Number(raw.LengthOfAppt),
    sortTime: instant ? instant.getTime() : Number.NEGATIVE_INFINITY
  };
}

export function parseApptsReply(raw, tz) {
  const body = String(raw ?? '').trim();
  if (!body) return { appointments: [], patientName: '' };

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    throw new ScenarioError(`Unreadable reply from ${RPC}: ${body.slice(0, 200)}`);
  }
  const error = errorText(parsed?.Error ?? parsed?.ERROR ?? parsed?.error);
  if (error) throw new ScenarioError(`${RPC} failed: ${error}`);

  const items = extractList(parsed).filter((item) => item && typeof item === 'object');
  const appointments = items
    .map((item) => normalizeAppointment(item, tz))
    .sort((a, b) => (b.sortTime === a.sortTime ? 0 : b.sortTime > a.sortTime ? 1 : -1))
    .map(({ sortTime, ...rest }) => rest);
  const patientName = text(items.find((item) => item.Patient)?.Patient?.Name);
  return { appointments, patientName };
}

export default async function patientAppointments(ctx) {
  const s = ctx.settings;
  const params = buildApptsParams(s.dfn, s.fromDay, s.toDay, s.tz);
  const { appointments, patientName } = parseApptsReply(await ctx.rpc.call(RPC, params), s.tz);
  return {
    patient: { dfn: s.dfn, name: patientName },
    range: { from: toIso(s.fromDay), to: toIso(s.toDay) },
    total: appointments.length,
    appointments
  };
}
