import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { runCommand } from '../src/scenarios/index.js';
import { ScenarioError } from '../src/vista/scheduling.js';
import { fakeVista, isoPlus, makeCtx } from '../testlib/fakeVista.js';

const slot = (iso, start = '0900', end = '0930', code = '1') => ({ iso, start, end, code });

describe('regular', () => {
  test('books today after the current time, desired date today, linked to the request', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(0), '0800', '0830'), slot(isoPlus(0), '1400', '1430')] } });
    const result = await runCommand(makeCtx('regular', { rpc, flags: { dfn: '100677' } }));
    const [appt] = result.appointments;
    assert.equal(appt.appointmentDate, isoPlus(0));
    assert.equal(appt.start, '1400');
    assert.equal(appt.desiredDate, isoPlus(0));
    const arset = rpc.named('SDEC ARSET')[0].params;
    assert.equal(arset[1], '100677');
    assert.equal(arset[10], '11/17/2026');
    const appadd = rpc.named('SDEC APPADD')[0].params;
    assert.equal(appadd[14], `A|${appt.requestIen}`);
    assert.equal(appadd[2], '100677');
    assert.equal(rpc.named('SDEC GET PATIENT DEMOG').length, 0);
  });

  test('searches forward when the first day has no slots', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(3))] } });
    const result = await runCommand(makeCtx('regular', { rpc }));
    assert.equal(result.appointments[0].appointmentDate, isoPlus(3));
  });

  test('fails with no request created when nothing is open in the window', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(31))] } });
    await assert.rejects(runCommand(makeCtx('regular', { rpc })), /No open slot in clinic 195 between 2026-11-17 and 2026-12-17/);
    assert.equal(rpc.named('SDEC ARSET').length, 0);
  });

  test('picks a random patient when no DFN is configured', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(1))] } });
    const result = await runCommand(makeCtx('regular', { rpc }));
    assert.deepEqual(result.patient, { dfn: '100', name: 'ZZTEST,ONE' });
    assert.equal(rpc.named('SDEC ARSET')[0].params[1], '100');
  });

  test('--clinic overrides the default and unknown clinics fail before any write', async () => {
    const rpc = fakeVista({ slots: { 1532: [slot(isoPlus(1))] } });
    const result = await runCommand(makeCtx('regular', { rpc, flags: { clinic: '532' } }));
    assert.equal(result.appointments[0].clinicIen, '532');

    const rpc2 = fakeVista();
    await assert.rejects(runCommand(makeCtx('regular', { rpc: rpc2, flags: { clinic: '999' } })), /Clinic 999 has no scheduling resource/);
    assert.equal(rpc2.named('SDEC ARSET').length, 0);
  });

  test('uses the clinic appointment length when SDES GET CLINIC INFO2 provides it', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(1), '0800', '1000', '4')] }, clinicInfo: { 195: { Clinic: { LengthOfAppointment: '60' } } } });
    const result = await runCommand(makeCtx('regular', { rpc }));
    assert.equal(result.appointments[0].end, '0900');
    assert.equal(rpc.named('SDEC APPADD')[0].params[4], '60');
  });
});

// 15-minute open rows from `from` to `to` (HHMM) on a day.
function rows(iso, from, to) {
  const toMin = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(2));
  const hhmm = (m) => String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
  const out = [];
  for (let m = toMin(from); m < toMin(to); m += 15) out.push(slot(iso, hhmm(m), hhmm(m + 15)));
  return out;
}
const len30 = { 195: { Clinic: { LengthOfAppointment: '30' } } };

describe('regular --at and --length', () => {
  test('--at books exactly that start at the clinic length', async () => {
    const rpc = fakeVista({ slots: { 1195: [...rows(isoPlus(1), '0800', '1000'), ...rows(isoPlus(3), '0800', '1200')] }, clinicInfo: len30 });
    const result = await runCommand(makeCtx('regular', { rpc, flags: { at: `${isoPlus(3)}@9:00` } }));
    const [appt] = result.appointments;
    assert.deepEqual([appt.appointmentDate, appt.start, appt.end, appt.lengthMinutes], [isoPlus(3), '0900', '0930', 30]);
    assert.equal(rpc.named('SDEC ARSET').length, 1);
    assert.equal(rpc.named('SDEC APPADD').length, 1);
  });

  test('--at with --length books that length from that start', async () => {
    const rpc = fakeVista({ slots: { 1195: rows(isoPlus(3), '0800', '1200') }, clinicInfo: len30 });
    const result = await runCommand(makeCtx('regular', { rpc, flags: { at: 'T+3@9:15', length: '45' } }));
    const [appt] = result.appointments;
    assert.deepEqual([appt.start, appt.end, appt.lengthMinutes], ['0915', '1000', 45]);
    assert.equal(rpc.named('SDEC APPADD')[0].params[4], '45');
  });

  test('--length alone books the earliest start that fits it', async () => {
    const rpc = fakeVista({ slots: { 1195: [...rows(isoPlus(1), '0800', '0830'), ...rows(isoPlus(2), '0800', '0900')] }, clinicInfo: len30 });
    const result = await runCommand(makeCtx('regular', { rpc, flags: { length: '45' } }));
    const [appt] = result.appointments;
    assert.deepEqual([appt.appointmentDate, appt.start, appt.end], [isoPlus(2), '0800', '0845']);
  });

  test('a time that is not open writes nothing and lists the nearest open starts', async () => {
    const rpc = fakeVista({ slots: { 1195: [...rows(isoPlus(3), '0800', '0900'), ...rows(isoPlus(3), '1000', '1200')] }, clinicInfo: len30 });
    await assert.rejects(
      runCommand(makeCtx('regular', { rpc, flags: { at: `${isoPlus(3)}@9:30` } })),
      (err) => {
        assert.match(err.message, /is not open in clinic 195 for 30 minutes\. Nearest open starts for 30 minutes: /);
        const starts = err.message.match(/\d{4}-\d\d-\d\d \d\d:\d\d/g).slice(1);
        assert.equal(starts.length, 5);
        assert.ok(starts.includes(`${isoPlus(3)} 08:30`) && starts.includes(`${isoPlus(3)} 10:00`));
        return true;
      }
    );
    assert.equal(rpc.named('SDEC ARSET').length, 0);
    assert.equal(rpc.named('SDEC APPADD').length, 0);
  });

  test('a length that no open run can hold is reported without writes', async () => {
    const rpc = fakeVista({ slots: { 1195: rows(isoPlus(3), '0800', '0900') }, clinicInfo: len30 });
    await assert.rejects(
      runCommand(makeCtx('regular', { rpc, flags: { at: `${isoPlus(3)}@8:00`, length: '120' } })),
      /not open in clinic 195 for 120 minutes\. No open starts for 120 minutes/
    );
    assert.equal(rpc.named('SDEC ARSET').length, 0);

    const rpc2 = fakeVista({ slots: { 1195: rows(isoPlus(3), '0800', '0900') }, clinicInfo: len30 });
    await assert.rejects(runCommand(makeCtx('regular', { rpc: rpc2, flags: { length: '120' } })), /No open slot in clinic 195/);
    assert.equal(rpc2.named('SDEC ARSET').length, 0);
  });

  test('--dry-run makes no calls and reports the plan', async () => {
    const rpc = fakeVista();
    const result = await runCommand(makeCtx('regular', { rpc, flags: { 'dry-run': true, at: 'T+3@9:00', length: '45' } }));
    assert.equal(rpc.calls.length, 0);
    assert.deepEqual(result.plan, { clinicIen: '195', start: `${isoPlus(3)} 09:00`, end: '09:45', lengthMinutes: 45, tz: 'America/New_York' });

    const plain = await runCommand(makeCtx('regular', { rpc, flags: { 'dry-run': true } }));
    assert.deepEqual(plain.plan, { clinicIen: '195', start: 'next open slot', end: undefined, lengthMinutes: 'clinic default', tz: 'America/New_York' });
    assert.equal(rpc.calls.length, 0);
  });
});

describe('cancel (one appointment)', () => {
  const cancel = (flags, rpc = fakeVista()) => runCommand(makeCtx('cancel', { rpc, flags }));

  test('default: cancelled by the clinic, request reopened, no reason, default note', async () => {
    const rpc = fakeVista();
    const result = await cancel({ appt: '65491' }, rpc);
    assert.deepEqual(result, { appointmentIen: '65491', cancelType: 'clinic', reopened: true, reasonIen: null, note: 'appts cancel' });
    assert.deepEqual(rpc.named('SDEC APPDEL').map((c) => c.params), [['65491', 'C', '', 'appts cancel', '', '520', '', '1']]);
    assert.equal(rpc.calls.length, 1);
  });

  test('--by patient, --no-reopen, --reason-ien and --note change the call', async () => {
    const rpc = fakeVista();
    const result = await cancel({ appt: '65491', by: 'patient', 'no-reopen': true, 'reason-ien': '5', note: 'test data cleanup' }, rpc);
    assert.deepEqual(result, { appointmentIen: '65491', cancelType: 'patient', reopened: false, reasonIen: '5', note: 'test data cleanup' });
    assert.deepEqual(rpc.named('SDEC APPDEL')[0].params, ['65491', 'PC', '5', 'test data cleanup', '', '520', '', '2']);
  });

  test('--dry-run makes no calls', async () => {
    const rpc = fakeVista();
    const result = await cancel({ appt: '65491', 'dry-run': true }, rpc);
    assert.equal(result.dryRun, true);
    assert.equal(rpc.calls.length, 0);
  });

  test('a VistA error is thrown with its text', async () => {
    const rpc = fakeVista({ appdel: () => 'SDEC08: Invalid Appointment ID' });
    await assert.rejects(cancel({ appt: '99999999' }, rpc), /Could not cancel appointment 99999999: SDEC08: Invalid Appointment ID/);
  });
});

describe('osm', () => {
  test('desired date 60 days back, appointment 60+ days out', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(59)), slot(isoPlus(60))] } });
    const result = await runCommand(makeCtx('osm', { rpc }));
    const [appt] = result.appointments;
    assert.equal(appt.desiredDate, isoPlus(-60));
    assert.equal(appt.appointmentDate, isoPlus(60));
    assert.equal(rpc.named('SDEC ARSET')[0].params[10], '9/18/2026');
    assert.equal(rpc.named('SDEC APPSLOTS')[0].params[1], isoPlus(60));
  });

  test('larger offsets are honored', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(70))] } });
    const result = await runCommand(makeCtx('osm', { rpc, flags: { 'past-days': '75', 'future-days': '70' } }));
    assert.equal(result.appointments[0].desiredDate, isoPlus(-75));
    assert.equal(result.appointments[0].appointmentDate, isoPlus(70));
  });
});

describe('failure cleanup', () => {
  test('APPADD failure after ARSET closes the request with disposition 6', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(1))] }, appadd: () => 'NO OPEN SLOTS' });
    await assert.rejects(runCommand(makeCtx('regular', { rpc })), (err) => {
      assert.ok(err instanceof ScenarioError);
      assert.equal(err.cleanup.removed.length, 1);
      assert.equal(err.cleanup.leftovers.length, 0);
      return true;
    });
    assert.deepEqual(rpc.named('SDEC ARCLOSE')[0].params, ['9001', '6', '520']);
    assert.equal(rpc.named('SDEC APPDEL').length, 0);
  });

  test('APPT_CLOSE_DISPOSITION overrides the ARCLOSE disposition', async () => {
    const rpc = fakeVista({ slots: { 1195: [slot(isoPlus(1))] }, appadd: () => 'NO OPEN SLOTS' });
    await assert.rejects(runCommand(makeCtx('regular', { rpc, env: { APPT_CLOSE_DISPOSITION: '10' } })));
    assert.equal(rpc.named('SDEC ARCLOSE')[0].params[1], '10');
  });

  test('a rejected slot falls through to the next candidate without cleanup', async () => {
    let first = true;
    const rpc = fakeVista({
      slots: { 1195: [slot(isoPlus(1), '0900', '0930'), slot(isoPlus(1), '0930', '1000')] },
      appadd: () => (first ? ((first = false), 'already scheduled at the same time') : null)
    });
    const result = await runCommand(makeCtx('regular', { rpc }));
    assert.equal(result.appointments[0].start, '0930');
    assert.equal(rpc.named('SDEC ARCLOSE').length, 0);
  });
});

describe('osmxgroup', () => {
  test('books in the other clinic when one clinic is already empty for 60 days', async () => {
    const rpc = fakeVista({ slots: { 1478: [slot(isoPlus(61))], 1485: [slot(isoPlus(10)), slot(isoPlus(90))] } });
    const result = await runCommand(makeCtx('osmxgroup', { rpc }));
    assert.equal(result.emptyClinic.clinicIen, '478');
    assert.equal(result.appointments[0].clinicIen, '485');
    assert.equal(result.appointments[0].appointmentDate, isoPlus(90));
    assert.equal(result.appointments[0].desiredDate, isoPlus(-60));
    assert.equal(rpc.named('SDES CANCEL CLIN AVAILABILITY').length, 0);
  });

  test('does not write anything when no clinic qualifies', async () => {
    const rpc = fakeVista({ slots: { 1478: [slot(isoPlus(5))], 1485: [slot(isoPlus(7)), slot(isoPlus(90))] } });
    await assert.rejects(runCommand(makeCtx('osmxgroup', { rpc })), (err) => {
      assert.match(err.message, /478: earliest 2026-11-22 0900; 485: earliest 2026-11-24 0900/);
      assert.equal(err.details.availabilityCheck.length, 2);
      return true;
    });
    for (const name of ['SDEC ARSET', 'SDEC APPADD', 'SDES CANCEL CLIN AVAILABILITY']) assert.equal(rpc.named(name).length, 0, name);
  });

  test('--block-availability cancels the first clinic for today..+60 then books', async () => {
    const rpc = fakeVista({ slots: { 1478: [slot(isoPlus(5)), slot(isoPlus(30))], 1485: [slot(isoPlus(90))] } });
    const result = await runCommand(makeCtx('osmxgroup', { rpc, flags: { 'block-availability': true } }));
    const cancels = rpc.named('SDES CANCEL CLIN AVAILABILITY');
    assert.equal(cancels.length, 61);
    assert.equal(cancels[0].params[0], '478');
    assert.equal(cancels[0].params[2], `${isoPlus(0)}T00:00-05:00`);
    assert.equal(cancels[60].params[2].slice(0, 10), isoPlus(60));
    assert.equal(result.blocked.clinicIen, '478');
    assert.equal(result.appointments[0].clinicIen, '485');
  });

  test('fails without writes when the blocked clinic still shows slots', async () => {
    const rpc = fakeVista({ slots: { 1478: [slot(isoPlus(5))], 1485: [slot(isoPlus(90))] }, cancelRemovesSlots: false });
    await assert.rejects(runCommand(makeCtx('osmxgroup', { rpc, flags: { 'block-availability': true } })), /still has 1 open slot/);
    assert.equal(rpc.named('SDEC ARSET').length, 0);
  });
});

describe('osmancillary', () => {
  test('two independent same-day appointments at non-overlapping times', async () => {
    const rpc = fakeVista({
      slots: {
        1532: [slot(isoPlus(90), '0900', '0930')],
        1521: [slot(isoPlus(90), '0900', '0930'), slot(isoPlus(90), '1000', '1030')]
      }
    });
    const result = await runCommand(makeCtx('osmancillary', { rpc }));
    const [primary, ancillary] = result.appointments;
    assert.equal(primary.role, 'primary');
    assert.equal(primary.clinicIen, '532');
    assert.equal(ancillary.clinicIen, '521');
    assert.equal(primary.appointmentDate, ancillary.appointmentDate);
    assert.equal(ancillary.start, '1000');
    assert.notEqual(primary.requestIen, ancillary.requestIen);
    for (const call of rpc.named('SDEC ARSET')) {
      assert.equal(call.params[10], '9/18/2026');
      assert.equal(call.params[13], 'NO');
      assert.equal(call.params[24], '');
    }
    for (const call of rpc.named('SDEC APPADD')) assert.equal(call.params[23], '');
  });

  test('no common day fails without writes', async () => {
    const rpc = fakeVista({ slots: { 1532: [slot(isoPlus(90))], 1521: [slot(isoPlus(91))] } });
    await assert.rejects(runCommand(makeCtx('osmancillary', { rpc })), /No day between/);
    assert.equal(rpc.named('SDEC ARSET').length, 0);
  });

  test('ancillary failure cancels the primary (SDF=2) and closes the ancillary request', async () => {
    const rpc = fakeVista({
      slots: { 1532: [slot(isoPlus(90), '0900', '0930')], 1521: [slot(isoPlus(90), '1000', '1030')] },
      appadd: (p) => (p[17] === '521' ? 'Clinic not available' : null)
    });
    await assert.rejects(runCommand(makeCtx('osmancillary', { rpc })), (err) => {
      assert.equal(err.cleanup.removed.length, 2);
      return true;
    });
    const appdel = rpc.named('SDEC APPDEL');
    assert.equal(appdel.length, 1);
    assert.equal(appdel[0].params[0], '7001');
    assert.equal(appdel[0].params[7], '2');
    assert.deepEqual(rpc.named('SDEC ARCLOSE').map((c) => c.params[0]), ['9002']);
  });
});

describe('cancel-availability', () => {
  test('one call per day with offsets across the DST change', async () => {
    const rpc = fakeVista();
    const result = await runCommand(makeCtx('cancel-availability', { rpc, flags: { from: '2026-10-31', to: '2026-11-02' } }));
    assert.deepEqual(rpc.named('SDES CANCEL CLIN AVAILABILITY').map((c) => [c.params[0], c.params[2], c.params[3]]), [
      ['478', '2026-10-31T00:00-04:00', '2026-10-31T21:00-04:00'],
      ['478', '2026-11-01T00:00-04:00', '2026-11-01T21:00-05:00'],
      ['478', '2026-11-02T00:00-05:00', '2026-11-02T21:00-05:00']
    ]);
    assert.equal(result.availability.failed.length, 0);
  });

  test('--dry-run makes no calls', async () => {
    const rpc = fakeVista();
    const result = await runCommand(makeCtx('cancel-availability', { rpc, flags: { 'dry-run': true, days: '2' } }));
    assert.equal(rpc.calls.length, 0);
    assert.equal(result.availability.days.length, 3);
    assert.equal(result.availability.days[0].params[4], 'testing');
  });

  test('continues past failed days and reports them', async () => {
    const rpc = fakeVista({ cancelFails: (iso) => iso === isoPlus(1) });
    await assert.rejects(runCommand(makeCtx('cancel-availability', { rpc })), (err) => {
      assert.deepEqual(err.details.availability.failed, [isoPlus(1)]);
      return true;
    });
    assert.equal(rpc.named('SDES CANCEL CLIN AVAILABILITY').length, 61);
  });
});
