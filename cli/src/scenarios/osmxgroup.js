import { addDays, toIso } from '../dates.js';
import { bookAppointment, cancelAvailability, resolvePatient, today } from '../engine.js';
import {
  ScenarioError, candidateSlots, getSlotBlocks, openBlocks, resolveClinic, slotDuration
} from '../vista/scheduling.js';

const NO_AVAILABILITY_DAYS = 60;

export default async function osmxgroup(ctx) {
  const s = ctx.settings;
  const t = today(ctx);
  const horizon = addDays(t, NO_AVAILABILITY_DAYS);

  const clinics = [];
  for (const ien of s.groupClinics) clinics.push(await resolveClinic(ctx, ien));

  let blocked = null;
  if (s.blockAvailability) {
    blocked = await cancelAvailability(ctx, { clinicIen: clinics[0].clinicIen, fromDay: t, toDay: horizon, reason: s.reason });
  }

  const checks = [];
  for (const clinic of clinics) {
    const open = openBlocks(await getSlotBlocks(ctx.rpc, clinic.resourceIen, t, horizon));
    checks.push({
      clinicIen: clinic.clinicIen,
      clinicName: clinic.name,
      openSlots: open.reduce((n, b) => n + b.open, 0),
      earliestOpen: open[0] ? `${toIso(open[0].day)} ${open[0].start}` : null,
      clinic
    });
  }
  const report = checks.map(({ clinic, ...rest }) => rest);

  let empty;
  if (s.blockAvailability) {
    if (checks[0].openSlots > 0) {
      throw new ScenarioError(
        `Clinic ${checks[0].clinicIen} still has ${checks[0].openSlots} open slot(s) in the next ${NO_AVAILABILITY_DAYS} days after blocking (earliest ${checks[0].earliestOpen}). Blocked availability was not restored.`,
        { availabilityCheck: report, blocked }
      );
    }
    [empty] = checks;
  } else {
    empty = checks.find((c) => c.openSlots === 0);
    if (!empty) {
      const summary = checks.map((c) => `${c.clinicIen}: earliest ${c.earliestOpen}`).join('; ');
      throw new ScenarioError(
        `No clinic in the group has zero availability in the next ${NO_AVAILABILITY_DAYS} days (${summary}). Use --block-availability or cancel-availability first.`,
        { availabilityCheck: report }
      );
    }
  }

  const desiredDay = addDays(t, -s.pastDays);
  const earliest = addDays(t, s.futureDays);
  const latest = addDays(earliest, s.searchDays);
  const patient = await resolvePatient(ctx);

  for (const check of checks.filter((c) => c !== empty)) {
    const blocks = await getSlotBlocks(ctx.rpc, check.clinic.resourceIen, earliest, latest);
    const candidates = candidateSlots(blocks, slotDuration(check.clinic, blocks));
    if (!candidates.length) continue;
    const appointment = await bookAppointment(ctx, {
      patient, clinic: check.clinic, candidates, desiredDay, label: 'osmxgroup appointment'
    });
    return {
      patient,
      appointments: [appointment],
      emptyClinic: { clinicIen: empty.clinicIen, clinicName: empty.clinicName, through: toIso(horizon) },
      availabilityCheck: report,
      blocked
    };
  }

  throw new ScenarioError(
    `No other clinic in the group has an open slot between ${toIso(earliest)} and ${toIso(latest)}`,
    { availabilityCheck: report, blocked }
  );
}
