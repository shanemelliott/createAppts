# VistA Appointment Creation Tool

This application creates bulk appointments in VistA  systems using direct VistaJS RPC connections. It's designed for testing and development environments to generate realistic appointment data.

## Features

- **Bulk Appointment Creation**: Generate hundreds of appointments efficiently
- **Progress Tracking**: Real-time progress bar or detailed logging modes
- **Timezone Aware**: Automatically converts local time zones to EST (VistA server timezone)
- **Random Patient/Clinic Assignment**: Uses random patient selection for realistic data distribution
- **Configurable Logging**: Toggle between progress bar mode and detailed debug output

## How It Works

1. **Connects directly to VistA** using VistaJS RPC library (no REST API middleware)
2. **Retrieves DEV clinics** filtered by clinic names starting with "DEV/"
3. **Generates random patients** using letter/number combinations
4. **Creates appointment requests** for each patient/clinic pair
5. **Schedules appointments** with random dates (today + 0-30 days) and time slots
6. **Handles errors gracefully** including connection resets and scheduling conflicts

## Installation

### Prerequisites
- Node.js (v14 or higher)
- Access to a VistA development server
- Valid VistA access/verify codes

### Setup
1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd createAppts
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure VistA connection**
   Edit `config.js` with your VistA server details:
   ```javascript
   module.exports = {
       host: 'your-vista-server.com',
       port: 9094,
       accessCode: 'YOUR_ACCESS_CODE',
       verifyCode: 'YOUR_VERIFY_CODE',
       clinicDebug: 0, // 0 = progress bar, 1 = detailed logs
       // ... other settings
   };
   ```

## Usage

### Start the Application
```bash
node .
```

### Available Commands

| Command | Function | Description |
|---------|----------|-------------|
| `l` | **List Clinics** | Shows all DEV clinics available for appointments |
| `m` | **Make Bulk Appointments** | Creates multiple appointments automatically |
| `r` | **Create Single Appointment** | Creates one test appointment request and appointment |
| `u` | **Authenticate User** | Tests user authentication and displays user info |

### Example Session
```bash
$ node .
Commands: l-list DEV clinics, m-make bulk appointments, r-create appointment request & appointment, u-authenticate user

# List available clinics
l
DEV Clinics: 15
DEV/CARDIO/1 (446)
DEV/PULM/2 (439)
...

# Create bulk appointments with progress bar
m
Progress: 45 attempts | ✓ 38 created | ✗ 7 errors

=== APPOINTMENT CREATION COMPLETE ===
Total Attempts: 45
Successful Appointments: 38
Errors: 7
Success Rate: 84.4%
=====================================
```

## Configuration Options

### Debug Modes
- **`clinicDebug: 0`** - Clean progress bar mode (recommended for production)
- **`clinicDebug: 1`** - Detailed logging mode (recommended for debugging)

### Time Slots
Configurable appointment time slots in `config.js`:
```javascript
slots: [
    ["08:00","08:30"],
    ["08:30","09:00"],
    ["09:00","09:30"],
    // ... customize as needed
]
```

## Technical Details

### VistA RPC Calls Used
- **SDEC RESCE** - Get clinic information
- **SDEC GET PATIENT DEMOG** - Retrieve patient demographics
- **SDEC ARSET** - Create appointment requests
- **SDEC APPADD** - Create appointments
- **ORWU USERINFO** - Get user information

### Error Handling
- **Connection Resets**: Automatic retry with delays
- **Duplicate Appointments**: Skips patients already scheduled
- **No Available Slots**: Logs error and continues to next patient
- **Invalid Parameters**: Detailed error reporting

### Timezone Handling
Automatically converts from any local timezone to Eastern Time (EST) where VistA servers are typically located.

## Development Notes

### VistA Response Format
VistA returns responses in a unique format. Successful appointment creation looks like:
```
I00020APPOINTMENTID^T00020ERRORID▲33573^▲▼
```
This translates to: Appointment ID 33573 with no errors.

### Patient Selection
- Uses random letter (A-Z) + number (1-20) combinations
- Calls `getRandName()` to find patients matching the pattern
- Ensures realistic distribution across patient population

## Troubleshooting

### Common Issues

1. **Connection Refused**
   - Verify VistA server host/port in config.js
   - Check network connectivity to VistA server

2. **Authentication Failed**
   - Verify access/verify codes in config.js
   - Ensure user has proper VistA permissions

3. **No DEV Clinics Found**
   - Check if clinics exist with names starting with "DEV/"
   - Verify user has access to clinic data

4. **Timezone Issues**
   - Application automatically handles timezone conversion
   - Ensure system clock is accurate

### Debug Mode
Set `clinicDebug: 1` in config.js for detailed logging:
```javascript
clinicDebug: 1 // Shows all RPC calls and responses
```

## Contributing

This tool was developed for VistA testing environments. Contributions welcome for:
- Additional RPC call implementations
- Error handling improvements
- Performance optimizations
- Documentation updates

## Disclaimer

**⚠️ For Development/Testing Only**
This tool is intended for development and testing environments only. Do not use in production VistA systems without proper authorization and testing.

