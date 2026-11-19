import { addDays, toIso } from '../dates.js';
import { bookAppointment, resolvePatient, today } from '../engine.js';
import {
  ScenarioError, candidateSlots, dayRange, getSlotBlocks, overlaps, resolveClinic, slotDuration
} from '../vista/scheduling.js';

// Two independent same-day appointments; the primary/ancillary pairing lives only in VEText OSM config.
export default async function osmancillary(ctx) {
  const s = ctx.settings;
  const t = today(ctx);
  const desiredDay = addDays(t, -s.pastDays);
  const earliest = addDays(t, s.futureDays);
  const latest = addDays(earliest, s.searchDays);

  const primary = await resolveClinic(ctx, s.clinic);
  const ancillary = await resolveClinic(ctx, s.ancillaryClinic);
  const pBlocks = await getSlotBlocks(ctx.rpc, primary.resourceIen, earliest, latest);
  const aBlocks = await getSlotBlocks(ctx.rpc, ancillary.resourceIen, earliest, latest);
  const pCandidates = candidateSlots(pBlocks, slotDuration(primary, pBlocks));
  const aCandidates = candidateSlots(aBlocks, slotDuration(ancillary, aBlocks));

  let chosen = null;
  for (const day of dayRange(earliest, latest)) {
    const iso = toIso(day);
    const pDay = pCandidates.filter((c) => toIso(c.day) === iso);
    const aDay = aCandidates.filter((c) => toIso(c.day) === iso);
    if (pDay.some((p) => aDay.some((a) => !overlaps(p, a)))) {
      chosen = { day, pDay, aDay };
      break;
    }
  }
  if (!chosen) {
    throw new ScenarioError(
      `No day between ${toIso(earliest)} and ${toIso(latest)} has non-overlapping open slots in both clinic ${primary.clinicIen} and clinic ${ancillary.clinicIen}`
    );
  }

  const patient = await resolvePatient(ctx);
  const primaryAppt = await bookAppointment(ctx, {
    patient, clinic: primary, candidates: chosen.pDay, desiredDay, label: 'osmancillary primary appointment'
  });
  const ancillaryAppt = await bookAppointment(ctx, {
    patient,
    clinic: ancillary,
    candidates: chosen.aDay.filter((a) => !overlaps(a, primaryAppt.slot)),
    desiredDay,
    label: `osmancillary ancillary appointment on ${toIso(chosen.day)}`
  });

  return {
    patient,
    appointments: [{ role: 'primary', ...primaryAppt }, { role: 'ancillary', ...ancillaryAppt }]
  };
}
