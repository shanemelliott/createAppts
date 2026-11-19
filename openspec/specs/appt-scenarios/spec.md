# appt-scenarios Specification

## Purpose
Defines the `appts` command-line tool (the `appt-scenario` package), which creates VistA appointment requests and appointments that match named test scenarios (regular, OSM, OSM cross-clinic group, OSM ancillary) for scheduling QA.

## Requirements

### Requirement: Scenario command interface
The tool SHALL be invoked as `appts <scenario> [options]` (or `node appt-cli/bin/appt-scenario.js <scenario> [options]` when the `appts` command is not installed), where `<scenario>` is one of `regular`, `osm`, `osmxgroup`, or `osmancillary`, or as `appts cancel-availability [options]`. `--help` SHALL list the scenarios, the `cancel-availability` command, and their options, and all usage text SHALL call the tool `appts`.

#### Scenario: Unknown scenario
- **WHEN** the user runs `appts foo`
- **THEN** the tool exits non-zero and lists the valid scenario names

#### Scenario: Help
- **WHEN** the user runs `appts --help` or `appts <scenario> --help`
- **THEN** the tool prints usage, options, and the matching environment variables, and exits zero without connecting to VistA

### Requirement: Patient selection
The tool SHALL use the patient DFN from `--dfn` or the `APPT_DFN` setting. If neither is provided, it SHALL pick a random patient from the site's test patients and report the chosen DFN.

#### Scenario: Explicit DFN
- **WHEN** `--dfn 100677` is passed
- **THEN** every request and appointment in the scenario uses patient DFN 100677

#### Scenario: Random patient
- **WHEN** no DFN is configured
- **THEN** the tool picks a patient, uses it for the whole scenario, and includes the DFN and name in the output

### Requirement: Clinic selection
The tool SHALL take clinic IENs from flags, then env/.env, then these built-in defaults, and SHALL resolve each clinic's scheduling resource before booking:

| Scenario | Clinic(s) | Default |
|---|---|---|
| `regular`, `osm` | `--clinic` / `APPT_CLINIC` | `195` (CARDIOLOGY) |
| `osmxgroup` | `--group-clinics` / `APPT_GROUP_CLINICS` | `478,485` (DEV/ENDOCRINE/5, DEV/ENDOCRINE/6) |
| `osmancillary` primary | `--clinic` / `APPT_PRIMARY_CLINIC` | `532` (DEV PACT MD 4) |
| `osmancillary` ancillary | `--ancillary-clinic` / `APPT_ANCILLARY_CLINIC` | `521` (LABORATORY) |

#### Scenario: Defaults used
- **WHEN** the user runs `appts osmancillary` with no clinic flags or settings
- **THEN** the primary appointment is in clinic 532 and the ancillary appointment is in clinic 521

#### Scenario: Override default
- **WHEN** the user runs `appts regular --clinic 532`
- **THEN** the appointment is booked in clinic 532 instead of 195

#### Scenario: Clinic not found
- **WHEN** the configured clinic IEN has no matching scheduling resource
- **THEN** the tool exits non-zero without creating a request or appointment

### Requirement: Forward slot search
When booking an appointment, the tool SHALL look for the first open slot on or after the scenario's earliest allowed date, searching forward up to a configurable window (default 30 days, `--search-days` / `APPT_SEARCH_DAYS`). If no slot is found in that window, it SHALL fail without overbooking.

#### Scenario: Slot available on earliest date
- **WHEN** the clinic has an open slot on the earliest allowed date
- **THEN** the appointment is booked in that slot

#### Scenario: Slot found later in window
- **WHEN** the earliest allowed date has no open slots but a later date within the window does
- **THEN** the appointment is booked in the first open slot found

#### Scenario: No slot in window
- **WHEN** no open slot exists anywhere in the search window
- **THEN** the tool exits non-zero, reports the clinic and the date range searched, and leaves no appointment request behind

### Requirement: Regular scenario
The `regular` scenario SHALL create an appointment request with today as the desired date, then book an appointment linked to that request in the first open slot on or after today.

#### Scenario: Regular appointment created
- **WHEN** the user runs `appts regular --clinic 532 --dfn 100677`
- **THEN** one appointment request and one linked appointment exist for the patient in clinic 532, and the output includes the request IEN, appointment IEN, desired date, and appointment date/time

### Requirement: OSM scenario
The `osm` scenario SHALL create an appointment request whose desired date is at least 60 days before today, then book a linked appointment at least 60 days after today.

#### Scenario: OSM date constraints met
- **WHEN** the user runs `appts osm --clinic 532`
- **THEN** the request's desired date is 60 or more days before today and the appointment date is 60 or more days after today

#### Scenario: Offsets can only be increased
- **WHEN** the user passes `--past-days` or `--future-days` with a value below the scenario minimum of 60
- **THEN** the tool exits non-zero and states the minimum

### Requirement: OSM cross-clinic group scenario
The `osmxgroup` scenario SHALL accept a group of clinic IENs from `--group-clinics` / `APPT_GROUP_CLINICS` (comma-separated, at least two). Before making any change, it SHALL check that at least one clinic in the group has no open slots in the next 60 days. It SHALL then create a request with desired date at least 60 days before today and book a linked appointment at least 90 days after today in a group clinic that does have availability. It SHALL NOT change clinic availability unless `--block-availability` is given.

#### Scenario: Group qualifies
- **WHEN** the group contains one clinic with no open slots in the next 60 days and another clinic with an open slot 90 or more days out
- **THEN** the tool creates the request and appointment and reports which clinic was verified as having no availability and which clinic was booked

#### Scenario: Group does not qualify
- **WHEN** every clinic in the group has at least one open slot in the next 60 days
- **THEN** the tool exits non-zero without creating any request or appointment, and reports the earliest open slot found for each clinic

#### Scenario: Too few clinics
- **WHEN** fewer than two clinic IENs are supplied
- **THEN** the tool exits non-zero before connecting to VistA

### Requirement: Cancel clinic availability
The tool SHALL provide `appts cancel-availability`, which cancels a clinic's availability for every day in a date range. It SHALL use one cancel call per day, covering 00:00–21:00 site local time. Options: clinic (`--clinic` / `APPT_BLOCK_CLINIC`, default `478`), range (`--from`/`--to` dates, or `--days N` from today, default 60), and reason (`--reason`, default `testing`). It SHALL report each day's result and SHALL continue past individual day failures, exiting non-zero if any day failed.

#### Scenario: Block next 60 days
- **WHEN** the user runs `appts cancel-availability --clinic 478 --days 60`
- **THEN** availability for clinic 478 is cancelled for today through today+60, and the output lists each date with its result

#### Scenario: Dry run
- **WHEN** `--dry-run` is passed
- **THEN** the tool prints the parameters it would send for each date and makes no cancel calls

#### Scenario: Partial failure
- **WHEN** cancelling one date fails
- **THEN** the tool still processes the remaining dates, lists the failed dates, and exits non-zero

### Requirement: osmxgroup availability blocking
When `osmxgroup` is run with `--block-availability`, the tool SHALL cancel availability for the first clinic in the group for today through today+60. It SHALL do this before the no-availability check, then run that check as usual. Cancelled availability SHALL NOT be restored by failure cleanup, and the output SHALL say which clinic and dates were blocked.

#### Scenario: Block then book
- **WHEN** the user runs `appts osmxgroup --block-availability` with the default group `478,485`
- **THEN** clinic 478 has no availability in the next 60 days, and the appointment is booked in clinic 485 at least 90 days out

#### Scenario: Still has slots after blocking
- **WHEN** blocking finishes but the clinic still shows open slots in the next 60 days
- **THEN** the tool exits non-zero without creating a request or appointment, and reports the remaining slots

### Requirement: OSM ancillary scenario
The `osmancillary` scenario SHALL create a primary request and appointment in the primary clinic (`--clinic`), plus an ancillary request and appointment in a separate ancillary clinic (`--ancillary-clinic` / `APPT_ANCILLARY_CLINIC`). Both appointments SHALL be on the same day, at least 90 days after today, at non-overlapping times. Both requests SHALL have a desired date at least 60 days before today. The ancillary request and appointment SHALL be ordinary records with no ancillary marker; the clinic pairing is defined outside VistA (VEText OSM configuration). The tool SHALL NOT link the two requests or appointments to each other.

#### Scenario: Ancillary pair created
- **WHEN** the user runs `appts osmancillary --clinic 532 --ancillary-clinic 610`
- **THEN** two independent appointments exist on the same date 90 or more days out, one in each clinic, with no parent request or multiple-RTC flag on either, and the output lists both request and appointment IENs

#### Scenario: No common day
- **WHEN** no date within the search window has open slots in both clinics
- **THEN** the tool exits non-zero and leaves no partial appointments behind

#### Scenario: Same clinic supplied twice
- **WHEN** `--ancillary-clinic` equals `--clinic`
- **THEN** the tool exits non-zero before connecting to VistA

### Requirement: Failure cleanup
If a scenario fails after creating some records, the tool SHALL try to remove what it created during that run (cancel appointments, disposition requests) and SHALL report anything it could not remove.

#### Scenario: Appointment booking fails after request created
- **WHEN** the request is created but booking the appointment fails
- **THEN** the tool tries to close the request and reports the request IEN if that does not work

#### Scenario: Later step fails after an appointment was booked
- **WHEN** an appointment was booked earlier in the run and a later step fails
- **THEN** the tool cancels that appointment without reopening its request, and reports the appointment IEN if the cancel fails

### Requirement: Output and exit codes
The tool SHALL print a human-readable summary by default, and with `--json` SHALL print a single JSON object to stdout with the scenario name, environment, patient, created records, and dates. It SHALL exit `0` on success and non-zero on any failure.

#### Scenario: JSON output
- **WHEN** a scenario succeeds with `--json`
- **THEN** stdout contains only one valid JSON object, and diagnostics go to stderr

#### Scenario: Scripted use
- **WHEN** the tool is called from a shell script and the scenario fails
- **THEN** the process exit code is non-zero
