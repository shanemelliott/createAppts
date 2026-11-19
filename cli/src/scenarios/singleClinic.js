import { addDays, toIso } from '../dates.js';
import { bookAppointment, notBeforeNow, resolvePatient, today } from '../engine.js';
import {
  ScenarioError, candidateSlots, getSlotBlocks, resolveClinic, slotDuration
} from '../vista/scheduling.js';

// Shared by `regular` (0/0 offsets) and `osm` (>=60/>=60): one request + one linked appointment in one clinic.
export default async function singleClinic(ctx) {
  const s = ctx.settings;
  const t = today(ctx);
  const desiredDay = addDays(t, -s.pastDays);
  const earliest = addDays(t, s.futureDays);
  const latest = addDays(earliest, s.searchDays);

  const clinic = await resolveClinic(ctx, s.clinic);
  const blocks = await getSlotBlocks(ctx.rpc, clinic.resourceIen, earliest, latest);
  const candidates = candidateSlots(blocks, slotDuration(clinic, blocks), { notBefore: notBeforeNow(ctx) });
  if (!candidates.length) {
    throw new ScenarioError(`No open slot in clinic ${clinic.clinicIen} between ${toIso(earliest)} and ${toIso(latest)}`);
  }

  const patient = await resolvePatient(ctx);
  const appointment = await bookAppointment(ctx, {
    patient, clinic, candidates, desiredDay, label: `${s.command} appointment`
  });
  return { patient, appointments: [appointment] };
}
