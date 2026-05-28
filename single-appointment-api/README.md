# Single Appointment API

A test harness for consult-linked appointment creation via vista-api-x, with a compact web UI to validate scheduling workflows.

**Version:** 2.0.0 | **Status:** Test/Development harness

---

## Table of Contents

- [Features](#features)
- [Primary Feature: Consult-Linked Scheduling](#primary-feature-consult-linked-scheduling)
- [Clinic List Management](#clinic-list-management)
- [Quick Start](#quick-start)
- [Prerequisites & Requirements](#prerequisites--requirements)
- [Token Server Setup (Critical)](#token-server-setup-critical)
- [Environment Configuration](#environment-configuration)
- [Installation & Running](#installation--running)
- [UI Workflow](#ui-workflow)
- [How Consult-Link Scheduling Works](#how-consult-link-scheduling-works)
- [API Endpoints](#api-endpoints)

---

## Features

### Appointment Creation
- **Consult-Linked Scheduling**: Direct appointment creation from existing Consult IEN
- **Patient Lookup**: Load default patient lists (ORQPT)
- **Clinic Selection**: Browse and select clinics with automatic resource IEN resolution
- **Availability Checking**: View and select available appointment slots
- **JWT Debug**: View token claims for troubleshooting

### Clinic List Management (NEW in v2.0)
- **Search Lists**: Find clinic lists by name and station ID
- **Create Lists**: Create new clinic lists for organizational purposes
- **Manage Items**: Add or remove clinics from lists
- **List Details**: View all clinics associated with a specific list

---

## Primary Feature: Consult-Linked Scheduling

**This app was written to enable direct appointment creation from an existing Consult IEN**, eliminating manual appointment request steps in VistA workflows.

### The Two Scheduling Paths

| **Path** | **When Used** | **RPC Flow** | **SDAPTYP Value** |
|----------|---------------|-------------|------------------|
| **Consult-Linked** | Consult IEN provided | Skip ARSET → APPADD | `C\|<consultIEN>` |
| **Non-Consult** | Consult IEN blank | ARSET → APPADD | `A\|<requestIEN>` |

### Expected Outcome (Consult Flow)
- Appointment IEN is returned from APPADD
- RequestType in response is `CONSULT`
- ConsultLink matches the consult IEN you provided
- Appointment appears in VistA clinic schedules immediately

---

## Clinic List Management

**New in Version 2.0**: Manage VA clinic lists through the CWS API.

### Features

- **Search Clinic Lists**: Find lists by name, station ID, user ID, or role
- **Create New Lists**: Define custom clinic lists with optional default settings
- **View List Items**: See all clinics associated with a specific list
- **Add Clinics**: Add clinics to lists by IEN and name
- **Remove Clinics**: Delete clinics from lists

### Use Cases

- **Organize Favorite Clinics**: Create personal lists of frequently used clinics
- **Role-Based Lists**: Maintain separate clinic lists for different roles or departments
- **Station Management**: Track clinic lists per VA station

### UI Access

Navigate to the **Clinic Lists** tab in the web interface to access all list management features.

---

## Quick Start

Assuming you already have the token server running (see [Token Server Setup](#token-server-setup-critical) below):

```bash
# 1. Copy environment template
cp .env.sample .env

# 2. Edit .env with your VA network details and endpoints
# Required: VISTA_API_KEY, VISTA_SITE_ID, VISTA_API_BASE_URL

# 3. Install dependencies
npm install

# 4. Start the app
npm start

# 5. Open browser
# http://localhost:4010
```

Health check endpoint:
```bash
curl http://localhost:4010/health
```

---

## Prerequisites & Requirements

### System Requirements
- **Node.js** 18.0.0 or later
- **npm** or **pnpm**
- **VA Network Access** (or VPN)
- **Internet** to reach VISTA_API_BASE_URL and CWS API endpoints

### Runtime Dependency: Token Server

**This app will NOT start and will NOT authenticate without a running token server.**

- The app calls `TOKEN_SERVER_URL` on startup and before each API call
- Default expected address: `http://localhost:3000`
- Tokens are cached in-memory for the app lifecycle

**Why a separate token server?**
- VA OAuth2 (Entra ID / Okta) token validation happens here
- Keeps secrets (cert serial, password) out of the UI app
- Simplifies token refresh and caching logic

---

## Token Server Setup (Critical)

### Getting the Token Server

The token server is **NOT included in this repository**. It must be obtained separately from VA GitHub Enterprise:

**Repository Location:**
```
https://va.ghe.com/software/octo-sts-token-generator
```

**Steps to set up:**

1. **Clone the token server into a sibling directory**
   ```bash
   cd ~/apps/createAppts
   git clone https://va.ghe.com/software/octo-sts-token-generator.git token-server-repo
   cd token-server-repo
   ```

2. **Install (no dependencies — uses Node.js built-ins only)**
   ```bash
   cd token-server
   # No npm install needed
   node .
   # Should output: Token Server running on http://localhost:3000
   ```

3. **Verify it's working**
   ```bash
   curl http://localhost:3000/token
   # Should return a JWT
   ```

### Configuration Files

Inside the `token-server` directory:

#### `env.js` — Environment selector
```javascript
module.exports = {
  env: 'sqa'  // or 'preprod' for staging, 'prod' for production
};
```

#### `env-sqa.properties`, `env-prod.properties` — Credentials
Configure environment-specific properties files with your certificate serial and endpoints. Reference the token server documentation for details.

#### Special Case: Staging + Preprod Cross-Environment Setup

For staging environments that require preprod SAML authentication, configure the preprod properties file with your certificate serial and appropriate endpoints. Reference the token server documentation for details.

### Keep Token Server Running

Run the token server in a **separate terminal** before starting the appointment app:

```bash
# Terminal 1: Token Server
cd <path-to-token-server>
node .

# Terminal 2: This App
cd <path-to-single-appointment-api>
npm start
```

---

## Environment Configuration

### Copy Environment Template

```bash
cp .env.sample .env
```

### Edit `.env` with Required Values

```env
# App Server Port
PORT=4010

# Token Server (must be running)
TOKEN_SERVER_URL=http://localhost:3000

# VistA API Configuration
VISTA_API_BASE_URL=<your-vista-api-url>
VISTA_API_KEY=<your-vista-api-key>
VISTA_SITE_ID=<your-site-id>

# CWS API Configuration
CWS_API_BASE_URL=<your-cws-api-url>

# TLS Verification
NODE_TLS_REJECT_UNAUTHORIZED=1
```

### Environment Notes

- **NODE_TLS_REJECT_UNAUTHORIZED=1**: Required for production and staging VA endpoints
- Set to `0` **only** for local/controlled testing with self-signed certs (never in CI/CD)
- All endpoints must be reachable from your VA network location

---

## Installation & Running

### Install Dependencies

```bash
npm install
```

### Start the App

```bash
npm start
```

App will be available at: **http://localhost:4010**

### Development Mode

For auto-restart on file changes:

```bash
npm run dev
```

---

## UI Workflow

The web UI features two main sections accessible via tabs:

### 1. Appointments Tab (Consult-Linked Scheduling)

The appointment creator is intentionally **compact and streamlined** — no raw JSON editors.

#### Step-by-Step

1. **Search for Patient (Optional)** — Enter a partial name (e.g., "HARRIS,SHEB") and click "Search" to find specific patients
2. **Select Patient** — Choose from search results OR click "Refresh" to load the default patient list
3. **Select Clinic** — Sorted alphabetically; resource IEN resolved automatically
4. **Pick Appointment Date** — Calendar picker
5. **Load Slots** — Fetches from clinic availability
6. **Select Slot** — Choose available time
7. **Optional: Enter Consult IEN** — If scheduling from an existing consult
8. **Click "Run Flow"** — Creates appointment

#### Automatic Processing

- **Consult IEN provided:** Creates appointment directly with consult link (fast path)
- **Consult IEN blank:** Creates appointment request first, then links appointment (fallback)
- All payload parameters are auto-built from your selections

### 2. Clinic Lists Tab (List Management)

#### Step-by-Step

1. **Search Lists** — Enter list name and/or station ID, click "Search Lists"
2. **Create List** — Click "Create New List" to define a new clinic list
3. **View Items** — Click on any list card to view its clinics
4. **Add Clinic** — While viewing a list, click "Add Clinic" to add a new clinic
5. **Remove Clinic** — Click "Delete" next to any clinic to remove it from the list

---

## How Consult-Link Scheduling Works

### Consult IEN Provided (Recommended Path)

```
User selects clinic → Selects slot → Enters Consult IEN 123456 → Clicks Run

Flow:
  1. Skip ARSET entirely
  2. Build APPADD parameters with SDAPTYP piece 15 = "C|123456"
  3. Call SDEC APPADD
  4. Return appointment IEN + RequestType: CONSULT

Result in VistA:
  - Appointment scheduled immediately
  - ConsultLink = 123456
  - No manual request creation needed
```

### Consult IEN Blank (Fallback Path)

```
User selects clinic → Selects slot → Leaves Consult IEN empty → Clicks Run

Flow:
  1. Call ARSET (creates appointment request)
  2. Parse returned Request IEN (e.g., 67890)
  3. Build APPADD parameters with SDAPTYP piece 15 = "A|67890"
  4. Call SDEC APPADD
  5. Return appointment IEN

Result in VistA:
  - Request created and linked to appointment
  - RequestType: non-consult
```

---

## API Endpoints

### Lookup Endpoints (GET)

| Endpoint | Purpose | Query Params |
|----------|---------|--------------|
| `GET /api/lookups/clinics` | List all clinics | — |
| `GET /api/lookups/patients/default` | Load default patient list | — |
| `GET /api/lookups/patients/search` | Search patients by partial name | `name=<partial_name>` |
| `GET /api/lookups/clinics/:clinicIen/resource` | Get resource IEN for clinic | — |
| `GET /api/lookups/clinics/:clinicIen/availability` | Get available slots | `date=YYYY-MM-DD` |
| `GET /api/lookups/jwt-debug` | View parsed JWT claims | — |

### Appointment Creation (POST)

| Endpoint | Purpose | Body |
|----------|---------|------|
| `POST /api/appointments` | Create appointment | APPADD payload array |

### Clinic List Management

| Endpoint | Method | Purpose | Body/Params |
|----------|--------|---------|-------------|
| `/api/clinic-lists/search` | POST | Search clinic lists | `{ name?, stationId?, userId?, role? }` |
| `/api/clinic-lists` | POST | Create new list | `{ userId?, name*, stationId*, role?, userDefault? }` |
| `/api/clinic-lists/:listId/items` | GET | Get items in a list | — |
| `/api/clinic-lists/:listId/items/:clinicId/:clinicName` | PUT | Add clinic to list | Optional: `{}` |
| `/api/clinic-lists/items/:listItemId` | DELETE | Remove clinic from list | — |

**Note**: Fields marked with `*` are required. Fields with `?` are optional.

### Health Check (GET)

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | Simple health check (returns 200 OK) |

---
