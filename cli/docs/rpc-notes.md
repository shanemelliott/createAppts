# RPC notes for appt-scenario

Reference for the VistA RPCs the CLI calls. All are invoked over the RPC Broker under `VISTA_CONTEXT` (default `CDSP RPC CONTEXT`), which must include every RPC below.

Status legend: **verified** = confirmed from VistA source or an existing working tool in this repo; **pending dev sample** = format implemented from documentation/legacy code and still needs a captured response from dev.

## SDEC ARSET - create appointment request (SDECAR2, verified from source)

29 literal parameters (`INP(n)` = array index `n-1`):

| INP | Index | Meaning | Value sent |
|---|---|---|---|
| 1 | 0 | Request IEN (blank = new) | `''` |
| 2 | 1 | Patient DFN | DFN |
| 3 | 2 | Originating date/time | `M/D/YYYY@HH:MM` (now, `APPT_TZ`) |
| 4 | 3 | Institution name or IEN | signed-on user's division name (`XUS GET USER INFO`) |
| 5 | 4 | Request type | `APPT` |
| 6 | 5 | Clinic (IEN or name) | clinic IEN |
| 7 | 6 | Originating user (DUZ or name) | DUZ |
| 8 | 7 | Priority | `ASAP` (VistA recomputes from desired date) |
| 9 | 8 | Requested by | `PATIENT` |
| 11 | 10 | Desired date (CID/PID) | `M/D/YYYY` (may be in the past) |
| 12 | 11 | Comment | `appt-scenario <scenario>` |
| 13 | 12 | ENROLLMENT PRIORITY (`GROUP 1`-`GROUP 8`) | `GROUP 1` (not clinic grouping) |
| 14 | 13 | MULTIPLE APPOINTMENT RTC | `NO` (YES would create an MRTC request) |
| 18 | 17 | Service connected priority | `YES` |
| 22 | 21 | Appointment type (409.1) | `11` |
| 23 | 22 | Patient status | `ESTABLISHED` |
| 25 | 24 | Parent request | `''` (never linked) |

Reply: `I00020ERRORID^T00030ERRORTEXT` RS `<requestIen>^` RS US, or `-1^<message>`.

Note: SDECAR2 maps `GROUP3`/`GROUP4` without a space; `GROUP 1` is unaffected.

## SDEC APPADD - book appointment (verified from bulk-appointments / single-appointment-api)

25 parameters; the ones the CLI sets: 0/1 start/end `MON DD, YYYY@HH:MM`, 2 DFN, 3 resource IEN, 4 duration (minutes), 9 desired date `M/D/YYYY`, 10 `PATIENT`, 14 `A|<requestIen>`, 15 `YES`, 17 clinic IEN, 20 `11`, 21 `ESTABLISHED`, 22 overbook `0`, 23 parent request `''`, 24 `16`.

Reply: header RS `<appointmentId>^` RS US on success; `0^<error text>` (e.g. `NO OPEN SLOTS`, `already scheduled at the same time`) on failure. The CLI tries up to 10 candidate slots before giving up.

## SDEC APPSLOTS - open slots (verified against dev 2026-11-17)

Parameters: `[resourceIen, YYYY-MM-DD, YYYY-MM-DD]`.

Reply: header `T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY`, then rows `FMDATE^HHMM^HHMM^CODE`. Code `0`-`9` = that many open slots, `j`-`z` = 10+, blank/symbols/`A`-`W` = no bookable slots. Rows can run together when separators are stripped, so the parser splits on the `FMDATE^HHMM^HHMM^` prefix.

Dev sample for CARDIOLOGY (resource 46) on 2026-11-18, after one 30-minute appointment was booked at 07:00 (the two 15-minute rows dropped from `j` = 10 to `9`):

```
T00030DATE^T00030START_TIME^T00030END_TIME^I00010AVAILABILITY<RS>3261118^0700^0715^9<RS>3261118^0715^0730^9<RS>3261118^0730^0745^j<RS>...<RS>3261118^1445^1500^j<RS>3261118^1500^1800^<RS><US>
```

Rows follow the clinic increment (`IncrementsPerHr` = 15-MIN for 195), not the appointment length (`LengthOfAppt` = 30), so contiguous open rows are merged before fitting the appointment length. The trailing row with a blank code is the non-bookable remainder of the day.

Appointment length: `LengthOfAppt` from `SDES GET CLINIC INFO2` (verified on dev; the same reply also carries `Resource IEN`), otherwise the shortest open block.

## SDES GET APPTS BY PATIENT DFN3 - a patient's appointments (verified against dev 2026-11-18)

Parameters `[dfn, 'YYYY-MM-DDT00:00±HH:MM', 'YYYY-MM-DDT23:59±HH:MM']`, local wall time with the UTC offset for that date. Works under `CDSP RPC CONTEXT`; no second context is needed.

Reply is JSON text ending in `\r\n`:

- Appointments: `{"Appointment":[{...}, ...]}`.
- No appointments in the range: `{"Appointment":[""]}` (the array holds one empty string).
- Error (unknown patient 999999999): `{"Appointment":[""],"Error":["Invalid Patient ID."]}`.
- Cancelled appointments are included, with the status in `CurrentStatus`/`Status`.

Fields the CLI uses (other fields, including the whole `Patient` block with demographics, are ignored):

| Field | Example | Notes |
|---|---|---|
| `AppointmentIEN` | `65457` | number |
| `AppointmentDateTime` | `"2026-11-18T07:00-0500"` | offset has no colon; local time of the clinic |
| `EndTime`, `LengthOfAppt` | `"2026-11-18T07:30-0500"`, `30` | |
| `Clinic` | `{ "ClinicIEN": 195, "Name": "CARDIOLOGY", ... }` | object; `Resource` is `{ ClinicIEN, Name }` |
| `CurrentStatus` / `Status` | `"CANCELLED BY CLINIC"`, `"INPATIENT/NO ACT TAKN"` | cancelled appointments say so here; `AppointmentCancelled` is `"CANCELLED"` or `""` |
| `DataEntryClerk` / `SchedulerName` | `"TESTER,ONE"` / `""` | who booked it |
| `CancelledByUser` | `{ "ID": ..., "Name": "TESTER,ONE" }` or `[""]` | object when cancelled, `[""]` otherwise; `NoShowCancelledBy` is the plain name |
| `CancelDateTime`, `CancellationRemarks` | `"2026-11-17T17:29:47-0500"`, `"appt-scenario cleanup"` | |
| `RequestIEN` | `42460` | the appointment request it came from |
| `Patient` | `{ "DFN": 100126, "Name": "..." }` | name is read from here |

Dates before today were not exercised (the dev test patients only have appointments from today forward); the RPC takes any range.

## SDEC RESCE - clinic -> resource (verified from bulk-appointments)

Parameter `['']`. Rows include `RESOURCEID`, `CLINNAME`, `HOSPITAL_LOCATION_ID` (clinic IEN).

## SDEC GET PATIENT DEMOG - random patient (verified from bulk-appointments)

Parameters `[letter, count, '']`. Rows include `IEN` (DFN) and `NAME`.

## SDEC APPDEL - cancel appointment (cleanup; verified against dev 2026-11-17)

| Seq | Name | Value sent |
|---|---|---|
| 1 | SDECAPTID | appointment IEN (409.84) |
| 2 | SDECTYP | `C` (cancelled by clinic) |
| 3 | SDECCR | `''` |
| 4 | SDECNOT | `appt-scenario cleanup` |
| 5 | SDECDATE | `''` (now) |
| 6 | USERIEN | DUZ |
| 7 | - | `''` |
| 8 | SDF | `2` - not reopened; request closed with disposition REMOVED/EXTERNAL APP |

Dev reply on success (appointment 65457): `T00020ERRORID<RS><RS><US>`, i.e. the header and no data row. Failures carry error text in a data row.

## SDEC APPDEL - options for `appts cancel` (verified against dev 2026-11-19)

Parameters `[appointmentIen, type, reasonIen, note, '', duz, '', sdf]`.

| Call | Result |
|---|---|
| `C`, no reason, SDF `1`, note | success (header `T00020ERRORID`, no row); appointment shows `CANCELLED BY CLINIC` |
| `PC`, no reason, SDF `1`, note | success; appointment shows `CANCELLED BY PATIENT`; no new-PID argument needed |
| `C`, reason IEN `1`, SDF `2`, note | success; appointment shows `CANCELLED BY CLINIC` |
| cancelling an appointment that is already cancelled | success again (empty reply); nothing changes |
| unknown appointment IEN `99999999` | reply is a single row holding the message `SDEC08: Invalid Appointment ID` (no `ERRORID` value, no `^`) |

An error is therefore a data row whose first column is non-empty and not `0`, not only `-1^text`; `parseAppdelResponse` checks that. SDF `1` (reopen) is accepted, but there is no verified RPC to read a request's status, so whether the request returns to the pending list was not confirmed from the command line.

## SDEC ARCLOSE - close request (cleanup; verified against dev 2026-11-17)

Parameters `[requestIen, dispositionIen, DUZ]`. Dev reply on success (request 42464, disposition 6): `42464<RS><US>`, the closed request IEN. Failures return `-1^msg` / `-2^msg`.

SDEC DISPOSITION REASON (409.853) on dev: 1 DEATH, 2 REMOVED/NON-VA CARE, 3 REMOVED/SCHEDULED-ASSIGNED, 4 REMOVED/VA CONTRACT CARE, 5 REMOVED/NO LONGER NECESSARY, **6 ENTERED IN ERROR (default `APPT_CLOSE_DISPOSITION`)**, 7 TRANSFERRED TO EWL, 8 CHANGED CLINIC, 9 MRTC PARENT CLOSED, 10 REMOVED/EXTERNAL APP, 11 FAILURE TO RESPOND, 12 VET SELF-CANCEL, 13 CANCELLED NOT RE-OPENED.

## SDES CANCEL CLIN AVAILABILITY - block a clinic day (verified from single-appointment-api/cancel-november-availability.js)

Parameters `[clinicIen, 'F', 'YYYY-MM-DDT00:00±HH:MM', 'YYYY-MM-DDT21:00±HH:MM', reason]`, one call per day. The offset is computed per date from `APPT_TZ` (`-05:00` EST, `-04:00` EDT). Reply is JSON; any non-empty `Error*` key is treated as failure. Availability is never restored by the CLI.

## SDEC APPADD - start and length (verified against dev 2026-11-19)

`SDEC APPADD` accepts any length and a start inside an open run; the tool sets parameters 0 and 1 (start, end) and 4 (length in minutes) itself. On clinic 195 (CARDIOLOGY, clinic length 30, 15-minute slot rows), bookings at 09:00 (default 30), 10:00 for 45, 11:00 for 15, and 12:00 for 20 (not a multiple of the 15-minute increment) all succeeded, and `SDES GET APPTS BY PATIENT DFN3` returned each with the same start and length (`LengthOfAppt` 30, 45, 15, 20). No overbook was involved. The tool still only offers starts on the slot-row grid (run start + n x min(length, row size)), so a start such as 13:10 is reported as not open before anything is written. Test appointments were removed with `SDEC APPDEL` (SDF=2).

## Sign-on

`XUS SIGNON SETUP`, `XUS AV CODE` (encrypted `access;verify`), `XUS GET USER INFO` (DUZ, name, division), `XWB CREATE CONTEXT` (encrypted context). Framing and cipher pad are ported from `bulk-appointments/VistaJSLibrary.js` and pinned by `testlib/fixtures/legacy-framing.json`.
