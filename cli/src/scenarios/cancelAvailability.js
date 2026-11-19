import { addDays } from '../dates.js';
import { cancelAvailability, today } from '../engine.js';
import { ScenarioError } from '../vista/scheduling.js';

export default async function cancelAvailabilityCommand(ctx) {
  const s = ctx.settings;
  const fromDay = s.fromDay || today(ctx);
  const toDay = s.toDay || addDays(fromDay, s.days);
  const availability = await cancelAvailability(ctx, {
    clinicIen: s.clinic, fromDay, toDay, reason: s.reason, dryRun: s.dryRun
  });
  if (availability.failed.length) {
    throw new ScenarioError(
      `Cancelling availability failed for ${availability.failed.length} of ${availability.days.length} day(s): ${availability.failed.join(', ')}`,
      { availability }
    );
  }
  return { availability };
}
