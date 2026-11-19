# appt-datetime-options Specification

## Purpose
Lets users choose the start date/time and the length of the appointment that `appts regular` books.

## Requirements

### Requirement: Choose the start time
`appts regular --at "<date>@<time>"` SHALL book the appointment starting at that time in site time (`APPT_TZ`), instead of the next open slot. The value SHALL be validated before connecting: a malformed value, or a time that is not in the future, SHALL exit non-zero with a usage error. Both a date and a time are required.

#### Scenario: Book at a given time
- **WHEN** the user runs `appts regular --clinic 195 --at "12/2/2026@9:30"` and that time is open in the clinic
- **THEN** the appointment starts at 09:30 on 2026-12-02 site time and the output shows that start and the end time

#### Scenario: Invalid value
- **WHEN** `--at` has no date or no time, an unrecognised format, an impossible date or time, or is in the past
- **THEN** the tool exits non-zero before connecting, listing the accepted formats with examples

### Requirement: VistA date and time formats
The date part of `--at` SHALL accept VistA-style input: `M/D/YYYY` and `M/D/YY` (two-digit years are 20YY), `T` for today in site time, and `T+N` or `T-N` for N days from today. The ISO form `YYYY-MM-DD` SHALL also be accepted. The time part SHALL be 24-hour `H:MM` or `HH:MM`, or 12-hour with an `AM` or `PM` suffix (any case, optional space). The date and time SHALL be separated by `@`. Impossible dates and times (month 13, February 30, hour 25, minute 60) SHALL be rejected. `T` SHALL be resolved in `APPT_TZ`, not the host time zone.

#### Scenario: Slash date
- **WHEN** the user runs `appts regular --at "1/1/2027@9:30"`
- **THEN** the requested start is 2027-01-01 09:30 site time

#### Scenario: Relative dates
- **WHEN** the user runs `appts regular --at "T+1@14:00"` on 2026-11-19
- **THEN** the requested start is 2026-11-20 14:00 site time
- **AND** `T@15:00`, `T+0@15:00`, and `T-1@9:00` mean today and yesterday respectively, with a time that is not in the future rejected

#### Scenario: 12-hour time
- **WHEN** the user passes `--at "1/4/2027@2:30 PM"`
- **THEN** the requested start is 2027-01-04 14:30 site time

#### Scenario: ISO still works
- **WHEN** the user passes `--at "2027-01-01@09:30"`
- **THEN** the requested start is 2027-01-01 09:30 site time

### Requirement: Choose the length
`--length <minutes>` SHALL set the appointment length in minutes, replacing the clinic's default length. The value SHALL be a positive whole number and SHALL be validated before connecting. Without `--length` the clinic's own length is used.

#### Scenario: Custom length
- **WHEN** the user runs `appts regular --length 45` and an open run can hold 45 minutes
- **THEN** the appointment is booked for 45 minutes and the output shows the length

#### Scenario: Invalid length
- **WHEN** `--length` is zero, negative, or not a whole number
- **THEN** the tool exits non-zero before connecting

### Requirement: VistA dates for --from and --to
The `--from` and `--to` options of the patient-appointments listing, `availability`, and `cancel-availability` SHALL accept the same date forms as `--at` (`M/D/YYYY`, `M/D/YY`, `T`, `T+N`, `T-N`, and ISO `YYYY-MM-DD`), resolved in `APPT_TZ`. These options take a date only; a value with an `@` time part SHALL be rejected before connecting. Existing ISO values, `--days`, and `--months` SHALL keep working, and the existing rule that `--to` is not before `--from` SHALL still apply to the resolved dates.

#### Scenario: Relative range
- **WHEN** the user runs `appts availability --clinic 195 --from T --to T+30`
- **THEN** the grid covers today through 30 days from today in site time

#### Scenario: Slash dates
- **WHEN** the user runs `appts --dfn 100791 --from 12/1/2026 --to 12/31/2026`
- **THEN** the listing covers 2026-12-01 through 2026-12-31

#### Scenario: Time part rejected
- **WHEN** the user passes `--from "T@9:30"` to one of these commands
- **THEN** the tool exits non-zero before connecting, saying that only a date is allowed

#### Scenario: ISO unchanged
- **WHEN** the user passes `--from 2026-12-01 --to 2026-12-31`
- **THEN** the behaviour is the same as before this change

### Requirement: Verify availability before writing
When `--at` or `--length` is given, the tool SHALL check the clinic's open slots before creating anything. The appointment SHALL be booked only if the whole start-to-end span is open. The tool SHALL NOT overbook.

#### Scenario: Time not bookable
- **WHEN** the requested span is not fully open (closed day, booked, cancelled availability, or too short)
- **THEN** nothing is created, the exit code is non-zero, and the output lists up to five nearest open starts for that clinic and length

#### Scenario: Length only
- **WHEN** only `--length` is given
- **THEN** the tool books the earliest open start that fits that length, using the same search window as today

### Requirement: Dry run and unchanged defaults
`--dry-run` SHALL print the clinic, start, end, and length it would use without connecting. When neither `--at` nor `--length` is given, `appts regular` SHALL behave as before.

#### Scenario: Dry run
- **WHEN** the user adds `--dry-run` with `--at` or `--length`
- **THEN** no connection is made and the validated values are printed

#### Scenario: No options
- **WHEN** the user runs `appts regular` without `--at` or `--length`
- **THEN** it books the next open slot at the clinic's length, exactly as before
