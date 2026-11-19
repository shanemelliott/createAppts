import { addDays, fromIso, toIso } from '../src/dates.js';
import { resolveSettings, validateSettings } from '../src/settings.js';

const RS = '\u001e';
const US = '\u001f';

export const NOW = new Date('2026-11-17T15:00:00Z'); // 10:00 America/New_York
export const TODAY = fromIso('2026-11-17');

export function isoPlus(days) {
  return toIso(addDays(TODAY, days));
}

function fm(iso) {
  const d = fromIso(iso);
  return `${d.year - 1700}${String(d.month).padStart(2, '0')}${String(d.day).padStart(2, '0')}`;
}

// In-memory VistA stand-in that records every RPC call.
export function fakeVista({
  clinics = [
    { clinicIen: '195', resourceIen: '1195', name: 'CARDIOLOGY' },
    { clinicIen: '532', resourceIen: '1532', name: 'DEV PACT MD 4' },
    { clinicIen: '521', resourceIen: '1521', name: 'LABORATORY' },
    { clinicIen: '478', resourceIen: '1478', name: 'DEV/ENDOCRINE/5' },
    { clinicIen: '485', resourceIen: '1485', name: 'DEV/ENDOCRINE/6' }
  ],
  slots = {},
  appadd = () => null,
  cancelFails = () => false,
  cancelRemovesSlots = true,
  clinicInfo = {},
  appointmentsByDfn = {},
  apptsReply = null
} = {}) {
  const calls = [];
  let nextRequest = 9000;
  let nextAppt = 7000;
  const cancelled = new Set();

  const rpc = {
    calls,
    async call(name, params = []) {
      calls.push({ name, params });
      switch (name) {
        case 'SDEC RESCE':
          return `I00020RESOURCEID^T00030CLINNAME^I00020HOSPITAL_LOCATION_ID${RS}${clinics.map((c) => `${c.resourceIen}^${c.name}^${c.clinicIen}${RS}`).join('')}${US}`;
        case 'SDES GET CLINIC INFO2':
          if (clinicInfo[params[0]]) return JSON.stringify(clinicInfo[params[0]]);
          throw new Error('not in context');
        case 'SDEC APPSLOTS': {
          const [res, from, to] = params;
          const clinic = clinics.find((c) => c.resourceIen === res);
          const rows = (slots[res] || []).filter((s) => s.iso >= from && s.iso <= to
            && !(cancelled.has(`${clinic.clinicIen}|${s.iso}`) && cancelRemovesSlots));
          return `I00020DATE^I00020START^I00020END^T00030AVAILABILITY${RS}${rows.map((s) => `${fm(s.iso)}^${s.start}^${s.end}^${s.code ?? '1'}${RS}`).join('')}${US}`;
        }
        case 'SDEC GET PATIENT DEMOG':
          return `I00020IEN^T00030NAME${RS}100^ZZTEST,ONE${RS}${US}`;
        case 'SDES GET APPTS BY PATIENT DFN3': {
          if (apptsReply) return apptsReply(params);
          const list = appointmentsByDfn[params[0]] || [];
          return `${JSON.stringify({ Appointment: list.length ? list : [''] })}\r\n`;
        }
        case 'SDEC ARSET':
          nextRequest += 1;
          return `I00020ERRORID^T00030ERRORTEXT${RS}${nextRequest}^${RS}${US}`;
        case 'SDEC APPADD': {
          const error = appadd(params);
          if (error) return `I00020APPOINTMENTID^T00030ERRORID${RS}0^${error}${RS}${US}`;
          nextAppt += 1;
          return `I00020APPOINTMENTID^T00030ERRORID${RS}${nextAppt}^${RS}${US}`;
        }
        case 'SDEC APPDEL':
          return `I00020ERRORID^T00030ERRORTEXT${RS}0^${RS}${US}`;
        case 'SDEC ARCLOSE':
          return String(params[0]);
        case 'SDES CANCEL CLIN AVAILABILITY': {
          const iso = params[2].slice(0, 10);
          if (cancelFails(iso)) return JSON.stringify({ Error: [`cannot cancel ${iso}`] });
          cancelled.add(`${params[0]}|${iso}`);
          return JSON.stringify({ Success: true });
        }
        default:
          throw new Error(`fakeVista: unexpected RPC ${name}`);
      }
    }
  };
  rpc.named = (n) => calls.filter((c) => c.name === n);
  return rpc;
}

export function makeCtx(command, { flags = {}, env = {}, rpc, random = () => 0 } = {}) {
  const settings = validateSettings(resolveSettings({
    command,
    flags,
    env: { VISTA_ACCESS_CODE: 'ac', VISTA_VERIFY_CODE: 'vc', ...env }
  }));
  return { rpc, settings, user: { duz: '520', name: 'TESTER,ONE', division: 'CAMP MASTER' }, now: NOW, random, log: () => {} };
}

// Trimmed copy of a real SDES GET APPTS BY PATIENT DFN3 appointment (dev, 2026-11-18); extra fields override.
export function rawAppt({ ien, at, clinic = 'CARDIOLOGY', status = 'INPATIENT/NO ACT TAKN', dfn = 100791, name = 'EIGHTYTHREE,INPATIENT', ...extra }) {
  return {
    AppointmentCancelled: '',
    AppointmentDateTime: at,
    AppointmentIEN: ien,
    CancelDateTime: '',
    CancelledByUser: [''],
    Clinic: { ClinicIEN: 195, Name: clinic, StationNumber: 500 },
    CurrentStatus: status,
    DataEntryClerk: 'TESTER,ONE',
    LengthOfAppt: 30,
    NoShowCancelledBy: '',
    Patient: { DFN: dfn, Name: name },
    RequestIEN: 42496,
    Resource: { ClinicIEN: 195, Name: clinic },
    SchedulerName: '',
    Status: status,
    ...extra
  };
}
