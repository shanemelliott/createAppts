# Spec Delta

## Purpose

Lets users cancel one VistA appointment by its IEN from the `appts` command line, choosing who cancelled it and whether its request is reopened, without opening VistA.

## ADDED Requirements

### Requirement: Cancel one appointment by IEN
`appts cancel --appt <ien>` SHALL cancel exactly that appointment through `SDEC APPDEL`. The appointment IEN is required and SHALL be numeric. The command SHALL NOT accept a patient, clinic, or date range in place of the IEN.

#### Scenario: Cancel an appointment
- **WHEN** the user runs `appts cancel --appt 65491`
- **THEN** that appointment is cancelled by the clinic, the output names the appointment IEN and says it was cancelled, and the exit code is zero

#### Scenario: Missing or invalid IEN
- **WHEN** `--appt` is missing, empty, or not a number
- **THEN** the tool exits non-zero before connecting to VistA, saying that an appointment IEN is required

#### Scenario: No bulk form
- **WHEN** the user runs `appts cancel` with `--from`, `--to`, `--months`, or `--dfn` but no `--appt`
- **THEN** the tool does not cancel anything and exits non-zero before connecting, saying that `--appt` is required

### Requirement: Cancelled by clinic or patient
The tool SHALL record the cancellation as cancelled by the clinic by default and as cancelled by the patient when `--by patient` is given. Any other `--by` value SHALL be rejected before connecting.

#### Scenario: Default cancel type
- **WHEN** the user runs `appts cancel --appt 65491` with no `--by`
- **THEN** VistA is asked for a cancellation by the clinic

#### Scenario: Cancelled by the patient
- **WHEN** the user runs `appts cancel --appt 65491 --by patient`
- **THEN** VistA is asked for a cancellation by the patient

#### Scenario: Bad cancel type
- **WHEN** the user passes `--by nurse`
- **THEN** the tool exits non-zero before connecting, listing the valid values `clinic` and `patient`

### Requirement: Request reopened by default
The cancellation SHALL reopen the appointment's request so it returns to the pending list. `--no-reopen` SHALL instead close the request (as removed by an external application).

#### Scenario: Reopen by default
- **WHEN** the user runs `appts cancel --appt 65491`
- **THEN** VistA is asked to reopen the request, and the output says the request was reopened

#### Scenario: Do not reopen
- **WHEN** the user runs `appts cancel --appt 65491 --no-reopen`
- **THEN** VistA is asked not to reopen the request, and the output says the request was closed

### Requirement: Reason and note
The tool SHALL send no cancellation reason unless `--reason-ien N` is given (a numeric IEN from the site's cancellation-reason file). `--note "text"` SHALL send a note; with no `--note` the note SHALL be `appts cancel`. A non-numeric reason IEN or a note containing a line break SHALL be rejected before connecting.

#### Scenario: No reason by default
- **WHEN** the user runs `appts cancel --appt 65491`
- **THEN** no cancellation reason is sent and the note is `appts cancel`

#### Scenario: Reason and note supplied
- **WHEN** the user runs `appts cancel --appt 65491 --reason-ien 5 --note "test data cleanup"`
- **THEN** VistA receives reason IEN 5 and the note `test data cleanup`

#### Scenario: Invalid reason
- **WHEN** `--reason-ien` is not a number
- **THEN** the tool exits non-zero before connecting

### Requirement: Dry run
`--dry-run` SHALL show the appointment IEN, cancel type, reopen choice, reason, and note that would be sent, SHALL NOT connect to VistA, and SHALL NOT need credentials.

#### Scenario: Preview
- **WHEN** the user runs `appts cancel --appt 65491 --dry-run`
- **THEN** the tool prints what it would send, calls no RPC, and exits zero

### Requirement: Failure handling and output
If VistA rejects the cancellation (for example an unknown appointment IEN), the tool SHALL print VistA's error text and exit non-zero without reporting success. Cancelling an appointment that is already cancelled is accepted by VistA and SHALL be reported as success. A successful run SHALL print a human-readable line by default, and with `--json` SHALL print exactly one JSON object containing the appointment IEN, cancel type, whether the request was reopened, the reason IEN, and the note.

#### Scenario: VistA refuses
- **WHEN** VistA returns an error for the appointment IEN
- **THEN** the tool prints the error text, exits non-zero, and does not say the appointment was cancelled

#### Scenario: JSON output
- **WHEN** the user runs `appts cancel --appt 65491 --json` and it succeeds
- **THEN** stdout is one valid JSON object with `appointmentIen`, `cancelType`, `reopened`, `reasonIen`, and `note`

### Requirement: Same safety as the other commands
The command SHALL use the same environment guard, production check, credential handling, and exit codes as the scenarios.

#### Scenario: Production blocked
- **WHEN** the environment is not `dev` or `sqa`, or the VistA system reports that it is a production account
- **THEN** the tool exits non-zero without sending the cancellation
