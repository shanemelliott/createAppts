// Human and JSON rendering. JSON mode writes exactly one object to stdout; everything else goes to stderr.
import { renderAppointmentsTable } from './render/appointmentsTable.js';

export function buildEnvelope({ ok, settings, user, result, error }) {
  const envelope = {
    ok,
    command: settings.command,
    environment: settings.environment,
    host: settings.host,
    port: settings.port,
    station: settings.station,
    user: user ? { duz: user.duz, name: user.name } : undefined
  };
  if (result) Object.assign(envelope, stripInternal(result));
  if (error) {
    envelope.error = error.message;
    if (error.details && Object.keys(error.details).length) envelope.details = stripInternal(error.details);
    if (error.cleanup) envelope.cleanup = error.cleanup;
  }
  return envelope;
}

function stripInternal(value) {
  return JSON.parse(JSON.stringify(value, (key, val) => (key === 'slot' || key === 'clinic' ? undefined : val)));
}

export function renderHuman(envelope) {
  if (envelope.ok && envelope.command === 'patient-appts') return renderPatientAppointments(envelope);

  const tag = `[${String(envelope.environment).toUpperCase()}]`;
  const lines = [];
  const add = (text = '') => lines.push(`${tag} ${text}`);

  add(`${envelope.command} @ ${envelope.host}:${envelope.port} station ${envelope.station}${envelope.user ? ` as ${envelope.user.name || 'DUZ'} (${envelope.user.duz})` : ''}`);
  if (envelope.patient) add(`Patient: DFN ${envelope.patient.dfn}${envelope.patient.name ? ` ${envelope.patient.name}` : ''}`);

  for (const a of envelope.appointments || []) {
    add(`${a.role ? `${a.role}: ` : ''}clinic ${a.clinicIen}${a.clinicName ? ` ${a.clinicName}` : ''}`);
    add(`  request ${a.requestIen} desired ${a.desiredDate}`);
    add(`  appointment ${a.appointmentIen} on ${a.appointmentDate} ${fmt(a.start)}-${fmt(a.end)}${a.lengthMinutes ? ` (${a.lengthMinutes} min)` : ''}`);
  }

  if (envelope.command === 'cancel' && envelope.ok) {
    const what = `appointment ${envelope.appointmentIen} (by ${envelope.cancelType}, request ${envelope.reopened ? 'reopened' : 'closed'})`;
    add(envelope.dryRun ? `DRY RUN: would cancel ${what}` : `cancelled ${what}`);
    add(`  reason IEN ${envelope.reasonIen ?? 'none'}, note "${envelope.note}"`);
  }

  if (envelope.plan) {
    const p = envelope.plan;
    add(`DRY RUN: would book in clinic ${p.clinicIen}`);
    add(`  start ${p.start}${p.end ? ` to ${p.end}` : ''} (site time ${p.tz})`);
    add(`  length ${p.lengthMinutes}${typeof p.lengthMinutes === 'number' ? ' min' : ''}`);
  }

  if (envelope.emptyClinic) add(`No availability verified: clinic ${envelope.emptyClinic.clinicIen} through ${envelope.emptyClinic.through}`);
  const blocked = envelope.blocked || envelope.details?.blocked;
  if (blocked) add(`Availability cancelled (not restored): clinic ${blocked.clinicIen} ${blocked.from}..${blocked.to}${blocked.failed.length ? `, failed days: ${blocked.failed.join(', ')}` : ''}`);

  const availability = envelope.availability || envelope.details?.availability;
  if (availability) {
    add(`Cancel availability clinic ${availability.clinicIen} ${availability.from}..${availability.to}${availability.dryRun ? ' (DRY RUN)' : ''}`);
    for (const d of availability.days) {
      add(`  ${d.date} ${d.dryRun ? JSON.stringify(d.params) : d.ok ? 'ok' : `FAILED ${d.error}`}`);
    }
  }

  for (const c of envelope.details?.availabilityCheck || []) {
    add(`  clinic ${c.clinicIen}: ${c.openSlots} open slot(s) in next 60 days${c.earliestOpen ? `, earliest ${c.earliestOpen}` : ''}`);
  }
  for (const attempt of envelope.details?.attempts || []) add(`  attempt ${attempt}`);

  if (envelope.cleanup) {
    for (const r of envelope.cleanup.removed) add(`Cleanup: removed ${r.type} ${r.ien}`);
    for (const l of envelope.cleanup.leftovers) add(`Cleanup: COULD NOT remove ${l.type} ${l.ien} (${l.error})`);
  }

  add(envelope.ok ? 'OK' : `FAILED: ${envelope.error}`);
  return lines.join('\n');
}

function fmt(hhmm) {
  return hhmm ? `${hhmm.slice(0, 2)}:${hhmm.slice(2)}` : '';
}

function renderPatientAppointments(envelope) {
  const tag = `[${String(envelope.environment).toUpperCase()}]`;
  const { patient, range, appointments } = envelope;
  const who = `DFN ${patient.dfn}${patient.name ? ` ${patient.name}` : ''}`;
  const lines = [
    `${tag} appointments for ${who}, ${range.from} .. ${range.to} @ ${envelope.host}:${envelope.port}${envelope.user ? ` as ${envelope.user.name || 'DUZ'} (${envelope.user.duz})` : ''}`
  ];
  if (appointments.length) {
    lines.push(...renderAppointmentsTable(appointments));
    lines.push(`${tag} ${appointments.length} appointment(s)`);
  } else {
    lines.push(`${tag} No appointments found for DFN ${patient.dfn} between ${range.from} and ${range.to}`);
  }
  lines.push(`${tag} OK`);
  return lines.join('\n');
}
