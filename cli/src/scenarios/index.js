import { Ledger } from '../engine.js';
import availability from '../queries/availability.js';
import patientAppointments from '../queries/patientAppointments.js';
import cancelAvailability from './cancelAvailability.js';
import osmancillary from './osmancillary.js';
import osmxgroup from './osmxgroup.js';
import singleClinic from './singleClinic.js';

const HANDLERS = {
  regular: singleClinic,
  osm: singleClinic,
  osmxgroup,
  osmancillary,
  'cancel-availability': cancelAvailability,
  availability,
  'patient-appts': patientAppointments
};

// Runs a command; on failure rolls back anything created and attaches the cleanup outcome to the error.
export async function runCommand(ctx) {
  ctx.ledger = new Ledger();
  ctx.log = ctx.log || (() => {});
  try {
    return await HANDLERS[ctx.settings.command](ctx);
  } catch (err) {
    if (ctx.ledger.entries.length) {
      ctx.log(`Rolling back ${ctx.ledger.entries.length} record(s) created in this run`);
      err.cleanup = await ctx.ledger.rollback(ctx);
    }
    throw err;
  }
}
