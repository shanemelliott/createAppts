import { addDays, daysBetween, hhmmToMinutes, minutesToHhmm, toIso } from '../dates.js';
import { bookAppointment, notBeforeNow, resolvePatient, today } from '../engine.js';
import {
  ScenarioError, candidateSlots, getSlotBlocks, resolveClinic, slotDuration
} from '../vista/scheduling.js';

const NEAREST = 5;
const fmt = (hhmm) => `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
const stamp = (c) => `${toIso(c.day)} ${fmt(c.start)}`;

// Shared by `regular` (0/0 offsets) and `osm` (>=60/>=60): one request + one linked appointment in one clinic.
// `regular` can also pin the start (--at) and the length (--length).
export default async function singleClinic(ctx) {
  const s = ctx.settings;
  if (s.dryRun && s.command === 'regular') return dryRunPlan(s);

  const t = today(ctx);
  const desiredDay = addDays(t, -s.pastDays);
  const earliest = s.atDay || addDays(t, s.futureDays);
  const latest = addDays(earliest, s.searchDays);

  const clinic = await resolveClinic(ctx, s.clinic);
  const blocks = await getSlotBlocks(ctx.rpc, clinic.resourceIen, earliest, latest);
  const duration = s.length || slotDuration(clinic, blocks);
  const all = candidateSlots(blocks, duration, { notBefore: notBeforeNow(ctx) });

  let candidates = all;
  if (s.atDay) {
    candidates = all.filter((c) => toIso(c.day) === toIso(s.atDay) && c.start === s.atHhmm);
    if (!candidates.length) throw notBookable(s, clinic, duration, all);
  } else if (!candidates.length) {
    throw new ScenarioError(`No open slot in clinic ${clinic.clinicIen} between ${toIso(earliest)} and ${toIso(latest)}`);
  }

  const patient = await resolvePatient(ctx);
  const appointment = await bookAppointment(ctx, {
    patient, clinic, candidates, desiredDay, label: `${s.command} appointment`
  });
  return { patient, appointments: [appointment] };
}

function notBookable(s, clinic, duration, all) {
  const want = `${toIso(s.atDay)} ${fmt(s.atHhmm)}`;
  const distance = (c) => Math.abs(daysBetween(s.atDay, c.day) * 1440 + hhmmToMinutes(c.start) - hhmmToMinutes(s.atHhmm));
  const nearest = [...all].sort((a, b) => distance(a) - distance(b)).slice(0, NEAREST)
    .sort((a, b) => stamp(a).localeCompare(stamp(b)));
  const hint = nearest.length
    ? ` Nearest open starts for ${duration} minutes: ${nearest.map(stamp).join(', ')}.`
    : ` No open starts for ${duration} minutes were found in the next ${s.searchDays} days.`;
  return new ScenarioError(`${want} is not open in clinic ${clinic.clinicIen} for ${duration} minutes.${hint}`);
}

// No connection, so the clinic's own length is unknown: the end time is shown only with --length.
function dryRunPlan(s) {
  const endMinutes = s.length && s.atHhmm ? hhmmToMinutes(s.atHhmm) + s.length : null;
  return {
    dryRun: true,
    plan: {
      clinicIen: s.clinic,
      start: s.atDay ? `${toIso(s.atDay)} ${fmt(s.atHhmm)}` : 'next open slot',
      end: endMinutes !== null && endMinutes < 1440 ? fmt(minutesToHhmm(endMinutes)) : undefined,
      lengthMinutes: s.length || 'clinic default',
      tz: s.tz
    }
  };
}
