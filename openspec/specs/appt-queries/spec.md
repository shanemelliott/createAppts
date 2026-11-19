# appt-queries Specification

## Purpose
Lets users look up a patient's appointments and a clinic's availability from the `appts` command line, in formats VistA users recognize, without changing any data.

## Requirements

### Requirement: Read-only commands
The patient appointments listing and the availability display SHALL NOT create, change, or cancel any VistA record. They SHALL use the same environment guard (dev and sqa only), settings order, credential handling, and exit codes as the scenarios.

#### Scenario: Production blocked
- **WHEN** either command runs with the environment set to anything other than `dev` or `sqa`
- **THEN** it exits non-zero before connecting to VistA

#### Scenario: No writes
- **WHEN** either command runs
- **THEN** the only RPCs it calls are the lookup RPCs, never a request, booking, cancel, or availability-cancel RPC

### Requirement: Patient appointments listing
When no scenario or command name is given, and either at least one of `--dfn`, `--from`, `--to`, or `--months` is present or `APPT_DFN` is set, the tool SHALL list the patient's appointments from `SDES GET APPTS BY PATIENT DFN3`. The patient SHALL come from `--dfn` or `APPT_DFN`; there is no random-patient fallback. All appointments in the range SHALL be listed regardless of status, each with its status, newest first. `--help` and `--check` SHALL keep their own behavior.

#### Scenario: List with an explicit patient
- **WHEN** the user runs `appts --dfn 100791`
- **THEN** the tool prints one row per appointment from today through four months out, showing date and time, clinic, status, appointment IEN, who scheduled it, and who cancelled it when applicable, newest first

#### Scenario: Patient from the settings
- **WHEN** the user runs `appts --months 2` with `APPT_DFN` set
- **THEN** the tool lists that patient's appointments for today through two months out

#### Scenario: No patient given
- **WHEN** a listing flag is used and neither `--dfn` nor `APPT_DFN` is set
- **THEN** the tool exits non-zero before connecting, saying that a patient is required

#### Scenario: Bare invocation with a default patient
- **WHEN** the user runs `appts` with no arguments and `APPT_DFN` is set
- **THEN** the tool lists that patient's appointments for the default range

#### Scenario: Bare invocation without a patient
- **WHEN** the user runs `appts` with no arguments and `APPT_DFN` is not set
- **THEN** the tool prints the help text and does not contact VistA

#### Scenario: Help always wins
- **WHEN** the user runs `appts --help` with `APPT_DFN` set
- **THEN** the tool prints the help text and does not contact VistA

#### Scenario: Cancelled and other statuses shown
- **WHEN** the patient has booked, cancelled, and no-show appointments in the range
- **THEN** all of them are listed, each with its status text from VistA

#### Scenario: No appointments
- **WHEN** the patient has no appointments in the range
- **THEN** the tool prints a "no appointments found" message with the range searched and exits zero

### Requirement: Appointment date range
The listing SHALL cover today through four months from today by default, in the configured time zone. `--from` and `--to` (`YYYY-MM-DD`) SHALL set the range explicitly, and `--months N` SHALL set the end to N months after the start. Dates SHALL be sent to VistA as local wall time with the UTC offset for that date.

#### Scenario: Explicit range
- **WHEN** the user passes `--from 2026-09-01 --to 2026-09-30`
- **THEN** the lookup covers 2026-09-01 00:00 through 2026-09-30 23:59 site time

#### Scenario: Invalid range
- **WHEN** `--from` is after `--to`, a date is malformed, or `--months` is not a positive integer
- **THEN** the tool exits non-zero before connecting, naming the bad option

#### Scenario: Daylight saving offset
- **WHEN** the range starts on a date in daylight time and ends in standard time
- **THEN** each boundary carries the correct offset for its own date

### Requirement: Clinic availability display
`appts availability` SHALL show one clinic's availability for a date range as a grid in the style of the VistA availability display: a `TIME` header with the hours across, a `DATE` line, and one row per day labeled with the weekday abbreviation and day of the month (for example `WE 18`). Each hour cell SHALL show, in brackets, one availability code per slot increment in that hour, in time order (for example `[jjjj]`). Hours the clinic has no slots in SHALL be blank. Days for which VistA returns no pattern SHALL be omitted. After the grid the tool SHALL print the code legend: `0-9` and `j-z` are available slots (`j`=10, `k`=11, up to `z`=26), `A-W` are overbooks (`A` the first slot to be overbooked), and `*`, `$`, `!`, `@`, `#` are overbooks or appointments outside the clinic's regular hours.

#### Scenario: Grid for a clinic
- **WHEN** the user runs `appts availability --clinic 195 --days 14`
- **THEN** the output shows the clinic name and date range, the hour header, one row per day that has availability, bracketed codes in the hour cells, and the legend

#### Scenario: Hour labels
- **WHEN** a clinic's slots run from 07:00 to 15:00
- **THEN** the hour columns run from `7` through `3` using a 12-hour clock without am/pm, matching the VistA display

#### Scenario: Month boundary
- **WHEN** the range spans more than one month
- **THEN** the grid shows a month heading before the first row of each month so the day numbers are unambiguous

#### Scenario: Closed days omitted
- **WHEN** weekend days have no clinic pattern
- **THEN** no rows appear for those days

#### Scenario: Unknown clinic
- **WHEN** the clinic IEN has no scheduling resource
- **THEN** the tool exits non-zero and says the clinic was not found

### Requirement: Availability paging
When the availability grid is printed to a terminal (standard input and output are both terminals) and `--json` is not used, the tool SHALL print it one page at a time, 10 day rows per page by default, in the manner of the VistA screen: after each page except the last it SHALL prompt `PRESS RETURN TO CONTINUE OR ^ TO QUIT`. Return SHALL show the next page and `^` SHALL stop. Each page SHALL repeat the `TIME`/`DATE` header, and a page that starts partway through a month SHALL repeat that month's heading. The legend SHALL be printed after the last page, or when the user quits. `--page-size N` SHALL change the page length, and `--page-size 0` SHALL turn paging off. Output that is not going to a terminal, and `--json`, SHALL never pause.

#### Scenario: Interactive paging
- **WHEN** a user in a terminal runs `appts availability --days 60` and the grid has more than 10 day rows
- **THEN** the first 10 rows appear with the prompt, and pressing Return shows the next page with the header repeated

#### Scenario: Quit
- **WHEN** the user types `^` at the prompt
- **THEN** no more pages are printed, the legend is printed, and the command exits zero

#### Scenario: Piped output
- **WHEN** the output is redirected to a file or pipe
- **THEN** the whole grid is printed with no prompt and no waiting for input

#### Scenario: Paging off
- **WHEN** the user passes `--page-size 0`
- **THEN** the whole grid is printed without pauses even in a terminal

### Requirement: Availability range and clinic
The availability command SHALL take one clinic from `--clinic` or `APPT_CLINIC` (default `195`). The range SHALL default to today through 60 days, and `--from`/`--to` or `--days N` SHALL override it. A range longer than one lookup comfortably covers SHALL be fetched in consecutive chunks and shown as a single grid with no missing or repeated days.

#### Scenario: Default range
- **WHEN** the user runs `appts availability` with no range options
- **THEN** the grid covers today through 60 days from today for clinic 195

#### Scenario: Long range
- **WHEN** the user requests a range of several months
- **THEN** every day appears exactly once, in order, as if it were one lookup

#### Scenario: Conflicting range options
- **WHEN** `--days` is combined with `--from` or `--to`, or only one of `--from`/`--to` is given
- **THEN** the tool exits non-zero before connecting

### Requirement: Machine-readable output
With `--json`, both commands SHALL print exactly one JSON object to stdout and send diagnostics to stderr. The appointment listing SHALL include the patient DFN, the range, and an array of appointments with their fields. The availability output SHALL include the clinic, the range, and for each day its date and blocks (start, end, code, open slot count) with a total of open slots.

#### Scenario: JSON listing
- **WHEN** the user runs `appts --dfn 100791 --json`
- **THEN** stdout is one valid JSON object containing the appointments array

#### Scenario: JSON availability
- **WHEN** the user runs `appts availability --json`
- **THEN** stdout is one valid JSON object with a day entry per date that has availability

### Requirement: Help text names the command
The help text, usage lines, and error hints SHALL call the tool `appts`. The help SHALL list every scenario, `cancel-availability`, `availability`, the patient appointments listing (`appts --dfn N`), and their options, and SHALL state once that `node appt-cli/bin/appt-scenario.js` is the same command when `appts` is not installed.

#### Scenario: Help output
- **WHEN** the user runs `appts --help`
- **THEN** the usage lines start with `appts`, not `appt-scenario`, and include the scenarios, `cancel-availability`, `availability`, and `appts --dfn <dfn>`

#### Scenario: Error hints
- **WHEN** the user passes an unknown option or scenario
- **THEN** the error message points to `appts --help`

### Requirement: Lookup failures
If VistA returns an error or an unreadable reply for either lookup, the tool SHALL exit non-zero with the error text and no partial table.

#### Scenario: RPC error
- **WHEN** the appointments RPC returns an error for the patient
- **THEN** the tool prints the error and exits non-zero
