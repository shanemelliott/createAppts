import { requestDateTime, toIso, toMdy, nowHhmm, todayIn } from './dates.js';
import {
  ScenarioError, buildAppaddParams, buildAppdelParams, buildArcloseParams, buildArsetParams,
  buildCancelAvailabilityParams, dayRange, parseAppaddResponse, parseAppdelResponse, parseArcloseResponse,
  parseArsetResponse, parseCancelAvailabilityResponse, pickRandomPatient
} from './vista/scheduling.js';

const MAX_BOOKING_ATTEMPTS = 10;

// Tracks records created during one run so they can be undone in reverse order on failure.
export class Ledger {
  constructor() {
    this.entries = [];
  }

  request(ien, clinicIen) {
    this.entries.push({ type: 'request', ien, clinicIen, coveredByAppointment: false });
  }

  appointment(ien, requestIen, clinicIen) {
    const req = this.entries.find((e) => e.type === 'request' && e.ien === requestIen);
    if (req) req.coveredByAppointment = true;
    this.entries.push({ type: 'appointment', ien, requestIen, clinicIen });
  }

  async rollback(ctx) {
    const removed = [];
    const leftovers = [];
    for (const entry of [...this.entries].reverse()) {
      if (entry.type === 'request' && entry.coveredByAppointment) continue;
      try {
        const result = entry.type === 'appointment'
          ? parseAppdelResponse(await ctx.rpc.call('SDEC APPDEL', buildAppdelParams(entry.ien, ctx.user.duz)))
          : parseArcloseResponse(await ctx.rpc.call('SDEC ARCLOSE', buildArcloseParams(entry.ien, ctx.settings.closeDisposition, ctx.user.duz)));
        (result.ok ? removed : leftovers).push(result.ok ? entry : { ...entry, error: result.error });
      } catch (err) {
        leftovers.push({ ...entry, error: err.message });
      }
    }
    this.entries = [];
    return { removed, leftovers };
  }
}

export function today(ctx) {
  return todayIn(ctx.settings.tz, ctx.now);
}

export function notBeforeNow(ctx) {
  return { day: today(ctx), hhmm: nowHhmm(ctx.settings.tz, ctx.now) };
}

export async function resolvePatient(ctx) {
  if (ctx.settings.dfn) return { dfn: ctx.settings.dfn, name: '' };
  return pickRandomPatient(ctx.rpc, ctx.random);
}

// Creates one ARSET request and books the first candidate slot APPADD accepts.
export async function bookAppointment(ctx, { patient, clinic, candidates, desiredDay, label }) {
  if (!candidates.length) throw new ScenarioError(`No open slot available in clinic ${clinic.clinicIen} for ${label}`);

  const requestIen = parseArsetResponse(await ctx.rpc.call('SDEC ARSET', buildArsetParams({
    dfn: patient.dfn,
    requestDateTime: requestDateTime(ctx.settings.tz, ctx.now),
    institution: ctx.user.division,
    clinicIen: clinic.clinicIen,
    duz: ctx.user.duz,
    desiredDay,
    comment: `appt-scenario ${ctx.settings.command}`
  })));
  ctx.ledger.request(requestIen, clinic.clinicIen);
  ctx.log(`Created request ${requestIen} in clinic ${clinic.clinicIen} (desired ${toMdy(desiredDay)})`);

  const errors = [];
  for (const slot of candidates.slice(0, MAX_BOOKING_ATTEMPTS)) {
    const result = parseAppaddResponse(await ctx.rpc.call('SDEC APPADD', buildAppaddParams({
      slot,
      dfn: patient.dfn,
      resourceIen: clinic.resourceIen,
      clinicIen: clinic.clinicIen,
      desiredDay,
      requestIen
    })));
    if (result.ok) {
      ctx.ledger.appointment(result.appointmentId, requestIen, clinic.clinicIen);
      return {
        clinicIen: clinic.clinicIen,
        clinicName: clinic.name,
        requestIen,
        appointmentIen: result.appointmentId,
        desiredDate: toIso(desiredDay),
        appointmentDate: toIso(slot.day),
        start: slot.start,
        end: slot.end,
        lengthMinutes: slot.duration,
        slot
      };
    }
    errors.push(`${toIso(slot.day)} ${slot.start}: ${result.error}`);
    ctx.log(`APPADD rejected ${toIso(slot.day)} ${slot.start}: ${result.error}`);
  }
  throw new ScenarioError(`Could not book an appointment in clinic ${clinic.clinicIen} for ${label}`, { attempts: errors });
}

export async function cancelAvailability(ctx, { clinicIen, fromDay, toDay, reason, dryRun }) {
  const days = [];
  for (const day of dayRange(fromDay, toDay)) {
    const params = buildCancelAvailabilityParams(clinicIen, day, ctx.settings.tz, reason);
    if (dryRun) {
      days.push({ date: toIso(day), ok: true, dryRun: true, params });
      continue;
    }
    try {
      const result = parseCancelAvailabilityResponse(await ctx.rpc.call('SDES CANCEL CLIN AVAILABILITY', params));
      days.push({ date: toIso(day), ok: result.ok, error: result.error, response: result.raw });
    } catch (err) {
      days.push({ date: toIso(day), ok: false, error: err.message });
    }
    ctx.log(`Cancel availability ${clinicIen} ${toIso(day)}: ${days[days.length - 1].ok ? 'ok' : days[days.length - 1].error}`);
  }
  return {
    clinicIen,
    from: toIso(fromDay),
    to: toIso(toDay),
    dryRun: Boolean(dryRun),
    days,
    failed: days.filter((d) => !d.ok).map((d) => d.date)
  };
}
