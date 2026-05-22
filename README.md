# createAppts Workspace

A collection of appointment creation tools for VistA, supporting both single and bulk workflows.

---

## Projects

### 1. **single-appointment-api** (New Web Tool)

A modern web interface for creating **single appointments** with **consult-linked scheduling** support.

**Features:**
- Compact web UI (no JSON editors)
- Direct consult-to-appointment creation (skip ARSET if consult IEN provided)
- Token server authentication
- vista-api-x integration
- Real-time clinic availability checking

**Use this when:**
- Creating a single appointment from an existing consult
- Need a user-friendly web interface
- Working with modern authentication (OAuth2/token-server)

**Getting started:**
```bash
cd single-appointment-api
cp .env.sample .env
# Edit .env with credentials and endpoint URLs
npm install
npm start
# Open http://localhost:4010
```

See [single-appointment-api/README.md](./single-appointment-api/README.md) for complete setup.

---

### 2. **bulk-appointments** (Legacy Command-Line Tool)

A command-line tool for creating **multiple appointments** in batch mode.

**Features:**
- Batch appointment processing
- Command-line driven
- Self-contained package

**Use this when:**
- Creating many appointments at once
- Scripting/automation workflows
- Don't need a web interface

**Getting started:**
```bash
cd bulk-appointments
# See README.md in that directory for setup
```

---

### 3. **reference**

Supporting documentation and helper projects:
- `clinicListEditor/` — JWT/OAuth2 setup and clinic management
- `clinicListEditor/token-server/` — Token generation server (required by single-appointment-api)
- `OVerBookData/` — Analysis and overbook examples

---

## Which Tool Should I Use?

| Scenario | Tool |
|----------|------|
| I have a consult and want to create an appointment | **single-appointment-api** |
| I need to create many appointments programmatically | **bulk-appointments** |
| I want a web UI for scheduling | **single-appointment-api** |
| I'm automating a batch job | **bulk-appointments** |

---

## Development Notes

**single-appointment-api Status:** Test/Development harness (consult-linked flow)  
**bulk-appointments Status:** Retained for backward compatibility

Both tools can run independently. No shared dependencies between them.
