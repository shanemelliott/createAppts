import { ScenarioError, buildAppdelParams, parseAppdelResponse } from '../vista/scheduling.js';

// Cancels exactly one appointment by IEN with SDEC APPDEL.
export default async function cancelAppointment(ctx) {
  const s = ctx.settings;
  const cancel = {
    appointmentIen: s.appt,
    cancelType: s.by,
    reopened: !s.noReopen,
    reasonIen: s.reasonIen ?? null,
    note: s.note
  };
  if (s.dryRun) return { dryRun: true, ...cancel };

  const params = buildAppdelParams(s.appt, ctx.user.duz, {
    type: s.by === 'patient' ? 'PC' : 'C',
    reasonIen: s.reasonIen ?? '',
    note: s.note,
    reopen: !s.noReopen
  });
  const result = parseAppdelResponse(await ctx.rpc.call('SDEC APPDEL', params));
  if (!result.ok) throw new ScenarioError(`Could not cancel appointment ${s.appt}: ${result.error}`);
  return cancel;
}
