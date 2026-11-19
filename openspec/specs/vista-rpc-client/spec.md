# vista-rpc-client Specification

## Purpose
Provides a portable, zero-dependency way to authenticate to and call VistA RPCs over the RPC Broker TCP protocol, with configuration and safety guards suitable for headless Linux (EC2) and Windows consoles.

## Requirements

### Requirement: Portable runtime
The tool SHALL run on Node.js 18 or later on Amazon Linux 2023 and Windows without installing any npm runtime dependencies, native modules, .NET runtimes, or PIV/smart-card software.

#### Scenario: Fresh EC2 instance
- **WHEN** the `cli/` folder is copied to an Amazon Linux 2023 host that has only Node.js 18+ installed
- **THEN** the tool runs without needing `npm install` or `pnpm install`

#### Scenario: No dependencies declared
- **WHEN** `cli/package.json` is inspected
- **THEN** it declares no `dependencies`

### Requirement: Access/verify code authentication
The tool SHALL connect to a VistA RPC Broker by host and port, sign on with an access code and verify code, and create the required RPC context before calling scheduling RPCs.

#### Scenario: Successful sign-on
- **WHEN** valid host, port, access code and verify code are configured
- **THEN** the tool signs on, gets the user's DUZ and name, and can call scheduling RPCs in the configured RPC context (default `CDSP RPC CONTEXT`)

#### Scenario: Invalid credentials
- **WHEN** the broker rejects the access/verify codes
- **THEN** the tool exits non-zero with a message saying authentication failed, and the message does not contain the codes

#### Scenario: Host unreachable
- **WHEN** the broker host/port cannot be reached within the connection timeout
- **THEN** the tool exits non-zero with a message naming the host and port it tried

### Requirement: Layered configuration
The tool SHALL resolve each setting from command-line flags first, then process environment variables, then an optional `.env` file, then built-in defaults, without using third-party configuration libraries. Built-in defaults SHALL be: environment `sqa`, port `9094`, RPC context `CDSP RPC CONTEXT`, station `500`. The broker host SHALL have no built-in default and SHALL be required (`VISTA_HOST` or `--host`) by every command that connects; the release package SHALL ship a `.env.sample` with the host filled in from the git-ignored local release config.

#### Scenario: Defaults only
- **WHEN** `VISTA_HOST`, `VISTA_ACCESS_CODE` and `VISTA_VERIFY_CODE` are set and nothing else
- **THEN** the tool connects to that host on port `9094` as environment `sqa`, station `500`, using context `CDSP RPC CONTEXT`

#### Scenario: Host missing
- **WHEN** `VISTA_HOST` is not set anywhere and a command that connects is run
- **THEN** the tool exits non-zero before connecting, naming `VISTA_HOST` as missing

#### Scenario: Env var overrides .env
- **WHEN** `VISTA_HOST` is set in both the process environment and the `.env` file
- **THEN** the tool uses the value from the process environment

#### Scenario: Flag overrides env var
- **WHEN** `--host` is passed on the command line and `VISTA_HOST` is also set
- **THEN** the tool uses the flag value

#### Scenario: Custom .env location
- **WHEN** `--env-file <path>` is passed
- **THEN** the tool loads settings from that file instead of the default `.env` in the current working directory

#### Scenario: Missing required setting
- **WHEN** the access code or verify code is missing from every source
- **THEN** the tool exits non-zero and names the missing setting and the env var that sets it

### Requirement: Production hard block
The tool SHALL refuse to run unless the resolved target environment (default `sqa`) is `dev` or `sqa`. No flag or setting can override this. Because that value is only a label the user sets, the tool SHALL also ask the VistA system it signed on to whether it is a production account, and SHALL stop, sign off, and call no scheduling RPC if VistA says it is production or if the answer cannot be determined.

#### Scenario: Production rejected
- **WHEN** the environment is set to `prod`, `production`, `preprod`, or any value other than `dev` or `sqa`
- **THEN** the tool exits non-zero before opening any network connection

#### Scenario: Environment not set
- **WHEN** no environment is configured
- **THEN** the tool uses `sqa` and shows it in the output

#### Scenario: Allowed environment
- **WHEN** the environment is `dev` or `sqa` (case-insensitive)
- **THEN** the tool continues to connect

#### Scenario: Server says it is production
- **WHEN** the environment label is `sqa` but the VistA system reports that it is a production account
- **THEN** the tool signs off, exits non-zero with a message saying the system is production, and no scheduling RPC is sent

#### Scenario: Production status cannot be confirmed
- **WHEN** the VistA system's reply about production status is missing, unreadable, or fails
- **THEN** the tool treats it as not confirmed, signs off, and exits non-zero without sending any scheduling RPC

#### Scenario: Server confirms non-production
- **WHEN** the VistA system reports that it is not a production account
- **THEN** the tool continues with the requested command

### Requirement: Connectivity check
The tool SHALL have a `--check` mode that validates configuration, signs on, reports the signed-on user and environment, and signs off without calling any scheduling write RPC.

#### Scenario: Check succeeds
- **WHEN** the user runs `appts --check` with valid configuration
- **THEN** the tool prints the environment, host, port, and signed-on user name/DUZ, and exits zero

### Requirement: Secret protection
The tool SHALL NOT write access codes, verify codes, or other credential values to stdout, stderr, log output, or JSON output, including in verbose/debug mode.

#### Scenario: Verbose mode
- **WHEN** the tool runs with `--verbose`
- **THEN** RPC traffic logs mask the sign-on parameters

#### Scenario: Config echo
- **WHEN** the tool prints the effective configuration
- **THEN** access and verify codes appear as `****`
