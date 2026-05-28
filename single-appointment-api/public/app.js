// Tab Navigation
document.addEventListener('DOMContentLoaded', () => {
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabContents = document.querySelectorAll('.tab-content');

  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');

      // Update nav tabs
      navTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');

      // Update content sections
      tabContents.forEach(content => {
        if (content.id === `${targetTab}-content`) {
          content.classList.add('active');
        } else {
          content.classList.remove('active');
        }
      });
    });
  });
});

// Appointment Creator (existing code)
const form = document.getElementById('appointment-form');
const loadJwtBtn = document.getElementById('load-jwt');
const copyJwtBtn = document.getElementById('copy-jwt');
const jwtOutput = document.getElementById('jwt-output');
const output = document.getElementById('output');

function pickFirstString(objectValue, keys) {
  for (const key of keys) {
    const value = objectValue && objectValue[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function toLastFirstFromJwtPayload(payload) {
  if (!payload || typeof payload !== 'object') return '';

  const fullName = typeof payload.name === 'string' ? payload.name.trim() : '';
  if (fullName && fullName.includes(',')) {
    const parts = fullName.split(',').map((part) => part.trim()).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0]},${parts[1]}`;
    }
  }

  const lastName = pickFirstString(payload, [
    'lastName',
    'lastname',
    'family_name',
    'familyName',
    'surname',
    'sn'
  ]);
  const firstName = pickFirstString(payload, [
    'firstName',
    'firstname',
    'given_name',
    'givenName',
    'given'
  ]);

  if (lastName && firstName) {
    return `${lastName},${firstName}`;
  }

  return '';
}

function log(message) {
  const now = new Date().toLocaleTimeString();
  const line = `[${now}] ${message}`;
  const current = output.textContent || '';
  output.textContent = (current ? current + '\n' : '') + line;
  output.scrollTop = output.scrollHeight;
}

loadJwtBtn.addEventListener('click', async () => {
  jwtOutput.textContent = 'Loading...';
  try {
    const res = await fetch('/api/lookups/jwt-debug');
    const data = await res.json();
    jwtOutput.textContent = JSON.stringify(data.payload, null, 2);

    const jwtRequestUser = toLastFirstFromJwtPayload(data.payload);
    if (jwtRequestUser && form.elements.requestUserName) {
      form.elements.requestUserName.value = jwtRequestUser;
    }
  } catch (err) {
    jwtOutput.textContent = 'Error: ' + err.message;
  }
});

copyJwtBtn.addEventListener('click', async () => {
  const originalText = copyJwtBtn.textContent;
  try {
    const res = await fetch('/api/lookups/jwt-debug');
    const data = await res.json();
    if (!data.token) throw new Error('No token in response');
    await navigator.clipboard.writeText(data.token);
    copyJwtBtn.textContent = 'Copied!';
  } catch (err) {
    copyJwtBtn.textContent = 'Error';
  } finally {
    setTimeout(() => { copyJwtBtn.textContent = originalText; }, 2000);
  }
});

async function initializeRequestUserFromJwt() {
  try {
    const response = await fetch('/api/lookups/jwt-debug');
    const body = await response.json();
    const jwtRequestUser = toLastFirstFromJwtPayload(body && body.payload);
    if (jwtRequestUser && form.elements.requestUserName) {
      form.elements.requestUserName.value = jwtRequestUser;
    }
  } catch (err) {
    log(`Request user auto-fill warning: ${err.message}`);
  }
}
const patientSelect = document.getElementById('patient-select');
const patientSearchInput = document.getElementById('patient-search-input');
const searchPatientsBtn = document.getElementById('search-patients-btn');
const clinicSelect = document.getElementById('clinic-select');
const refreshPatientsBtn = document.getElementById('refresh-patients');
const refreshClinicsBtn = document.getElementById('refresh-clinics');
const appointmentDateInput = document.getElementById('appointment-date');
const timeSlotSelect = document.getElementById('time-slot-select');
const loadSlotsBtn = document.getElementById('load-slots-btn');

let selectedPatient = null;
let selectedClinic = null;
let selectedResourceIen = '';
let availableSlots = [];
let selectedAppointmentParams = buildDefaultAppointmentParams();

function ensureAppointmentParamsLength(params) {
  const normalized = [...params];
  while (normalized.length < 25) {
    normalized.push('');
  }
  return normalized;
}

function buildDefaultAppointmentParams() {
  return ["", "", "", "", "60", "", "0", "0", "FALSE", "", "PATIENT", "", "", "", "", "YES", "", "", "", "", "11", "ESTABLISHED", "0", "", "16"];
}

function formatMmDdYyyy(date) {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const year = date.getFullYear();
  return `${month}/${day}/${year}`;
}

function formatNowForArset() {
  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${formatMmDdYyyy(now)}@${hh}:${mm}`;
}

function defaultDesiredDate() {
  const future = new Date();
  future.setDate(future.getDate() + 30);
  return formatMmDdYyyy(future);
}

function buildDefaultRequestParams({ patientDfn, clinicIen, clinicName, requestUserName, requestPriority, appointmentParams }) {
  const desiredDateFromAppAdd = String(appointmentParams[9] || '').trim();
  const desiredDate = desiredDateFromAppAdd || defaultDesiredDate();

  return [
    '',
    patientDfn,
    formatNowForArset(),
    clinicName || 'UNKNOWN CLINIC',
    'APPT',
    clinicIen,
    requestUserName || 'SYSTEM USER',
    requestPriority || 'ASAP',
    'PATIENT',
    '',
    desiredDate,
    '',
    'GROUP 1',
    'NO',
    '0',
    '0',
    '',
    'YES',
    '75',
    desiredDate,
    '',
    '11',
    'ESTABLISHED',
    '',
    '',
    '',
    '',
    '',
    ''
  ];
}

function setSelectOptions(selectElement, entries, valueField, labelBuilder) {
  const previousValue = selectElement.value;
  selectElement.innerHTML = '<option value="">Choose...</option>';

  entries.forEach((entry) => {
    const option = document.createElement('option');
    option.value = String(entry[valueField] || '');
    option.textContent = labelBuilder(entry);
    option.dataset.payload = JSON.stringify(entry);
    selectElement.appendChild(option);
  });

  if (previousValue) {
    selectElement.value = previousValue;
  }
}

async function loadPatients() {
  refreshPatientsBtn.disabled = true;
  try {
    const response = await fetch('/api/lookups/patients/default');
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || 'Failed to load patients');
    }

    setSelectOptions(
      patientSelect,
      body.patients || [],
      'dfn',
      (entry) => `${entry.name} (${entry.dfn})`
    );
  } catch (err) {
    log(`Patient load error: ${err.message}`);
  } finally {
    refreshPatientsBtn.disabled = false;
  }
}

async function searchPatients() {
  const searchTerm = patientSearchInput.value.trim();
  
  if (!searchTerm) {
    log('ERROR: Enter a partial patient name to search');
    return;
  }

  searchPatientsBtn.disabled = true;
  try {
    log(`Searching for patients matching: ${searchTerm}`);
    const response = await fetch(`/api/lookups/patients/search?name=${encodeURIComponent(searchTerm)}`);
    const body = await response.json();
    
    if (!response.ok || !body.success) {
      throw new Error(body.error || 'Failed to search patients');
    }

    if (body.patients.length === 0) {
      log(`No patients found matching: ${searchTerm}`);
      return;
    }

    log(`Found ${body.patients.length} patient(s) matching: ${searchTerm}`);
    
    // Show results in modal
    displayPatientSearchResults(body.patients);
  } catch (err) {
    log(`Patient search error: ${err.message}`);
  } finally {
    searchPatientsBtn.disabled = false;
  }
}

function displayPatientSearchResults(patients) {
  const modal = document.getElementById('patient-search-modal');
  const container = document.getElementById('patient-search-results-container');
  
  if (!patients || patients.length === 0) {
    container.innerHTML = '<p class="text-muted">No patients found</p>';
    return;
  }
  
  container.innerHTML = patients.map(patient => `
    <div class="patient-result-item" onclick="selectPatientFromSearch(${JSON.stringify(patient).replace(/"/g, '&quot;')})">
      <span class="patient-result-name">${patient.name}</span>
      <span class="patient-result-dfn">(DFN: ${patient.dfn})</span>
    </div>
  `).join('');
  
  // Open the modal
  modal.classList.add('show');
}

function selectPatientFromSearch(patient) {
  selectedPatient = patient;
  
  // Update the selected patient display
  const display = document.getElementById('selected-patient-display');
  const displayText = document.getElementById('selected-patient-text');
  displayText.textContent = `${patient.name} (DFN: ${patient.dfn})`;
  display.classList.remove('hidden');
  
  // Also update the dropdown to reflect the selection
  const option = document.createElement('option');
  option.value = patient.dfn;
  option.textContent = `${patient.name} (${patient.dfn})`;
  option.dataset.payload = JSON.stringify(patient);
  option.selected = true;
  
  // Clear and add just this option to show it's selected
  patientSelect.innerHTML = '';
  patientSelect.appendChild(option);
  
  // Close the modal
  const modal = document.getElementById('patient-search-modal');
  modal.classList.remove('show');
  
  log(`Selected patient: ${patient.name} (DFN: ${patient.dfn})`);
}

async function loadClinics() {
  refreshClinicsBtn.disabled = true;
  try {
    const response = await fetch('/api/lookups/clinics');
    const body = await response.json();
    if (!response.ok || !body.success) {
      throw new Error(body.error || 'Failed to load clinics');
    }

    const sortedClinics = (body.clinics || []).slice().sort((a, b) => {
      const aName = String(a.clinicName || '');
      const bName = String(b.clinicName || '');
      return aName.localeCompare(bName, undefined, { sensitivity: 'base' });
    });

    setSelectOptions(
      clinicSelect,
      sortedClinics,
      'clinicIen',
      (entry) => `${entry.clinicName} (Clinic ${entry.clinicIen || 'n/a'}, Resource ${entry.resourceIen || 'n/a'})`
    );
  } catch (err) {
    log(`Clinic load error: ${err.message}`);
  } finally {
    refreshClinicsBtn.disabled = false;
  }
}

async function resolveResourceIenForClinic(clinicIen) {
  const response = await fetch(`/api/lookups/clinics/${encodeURIComponent(clinicIen)}/resource`);
  const body = await response.json();
  if (!response.ok || !body.success) {
    throw new Error(body.error || 'Failed to resolve resource IEN');
  }
  return String(body.resourceIen || '');
}

refreshPatientsBtn.addEventListener('click', loadPatients);
searchPatientsBtn.addEventListener('click', searchPatients);

// Allow pressing Enter in the search field to trigger search
patientSearchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    searchPatients();
  }
});

refreshClinicsBtn.addEventListener('click', loadClinics);

patientSelect.addEventListener('change', () => {
  const selectedOption = patientSelect.options[patientSelect.selectedIndex];
  selectedPatient = selectedOption && selectedOption.dataset.payload
    ? JSON.parse(selectedOption.dataset.payload)
    : null;
});

clinicSelect.addEventListener('change', async () => {
  const selectedOption = clinicSelect.options[clinicSelect.selectedIndex];
  selectedClinic = selectedOption && selectedOption.dataset.payload
    ? JSON.parse(selectedOption.dataset.payload)
    : null;
  selectedResourceIen = '';

  if (!selectedClinic || !selectedClinic.clinicIen) return;

  try {
    selectedResourceIen = await resolveResourceIenForClinic(selectedClinic.clinicIen);
  } catch (err) {
    log(`Resource lookup error: ${err.message}`);
  }
});

async function loadAvailableSlots() {
  if (!selectedClinic || !selectedClinic.clinicIen) {
    log('ERROR: Clinic not selected. Make sure to select a clinic from the dropdown first');
    return;
  }
  if (!appointmentDateInput.value) {
    log('ERROR: Date not selected. Use the date picker to select an appointment date');
    return;
  }

  loadSlotsBtn.disabled = true;
  try {
    const dateStr = appointmentDateInput.value; // YYYY-MM-DD
    const response = await fetch(
      `/api/lookups/clinics/${encodeURIComponent(selectedClinic.clinicIen)}/availability?date=${encodeURIComponent(dateStr)}`
    );
    const body = await response.json();

    if (!response.ok || !body.success) {
      throw new Error(body.error || 'Failed to load availability');
    }

    availableSlots = body.slots || [];
    log(`Loaded ${availableSlots.length} time slots for ${dateStr}`);

    // Clear existing options
    timeSlotSelect.innerHTML = '<option value="">Select a time slot</option>';

    // Populate available slots (only show slots with availability)
    const availableOnly = availableSlots.filter(s => s.available);
    availableOnly.forEach((slot, index) => {
      const option = document.createElement('option');
      const startTime = new Date(slot.beginTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const endTime = new Date(slot.endTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      option.textContent = `${startTime} - ${endTime}`;
      option.dataset.payload = JSON.stringify(slot);
      timeSlotSelect.appendChild(option);
    });

    log(`${availableOnly.length} slots available for booking`);
  } catch (err) {
    log(`Availability load error: ${err.message}`);
  } finally {
    loadSlotsBtn.disabled = false;
  }
}

timeSlotSelect.addEventListener('change', () => {
  const selectedOption = timeSlotSelect.options[timeSlotSelect.selectedIndex];
  if (!selectedOption || !selectedOption.dataset.payload) {
    return;
  }

  const slot = JSON.parse(selectedOption.dataset.payload);

  // Also update appointment params if available
  const startDate = new Date(slot.beginTime);
  const endDate = new Date(slot.endTime);
  
  // Format start/end for APPADD (MON DD, YYYY@HH:MM format)
  const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const month = months[startDate.getMonth()];
  const day = String(startDate.getDate()).padStart(2, '0');
  const year = startDate.getFullYear();
  const startHour = String(startDate.getHours()).padStart(2, '0');
  const startMin = String(startDate.getMinutes()).padStart(2, '0');
  const endHour = String(endDate.getHours()).padStart(2, '0');
  const endMin = String(endDate.getMinutes()).padStart(2, '0');

  const startDateTime = `${month} ${day}, ${year}@${startHour}:${startMin}`;
  const endDateTime = `${month} ${day}, ${year}@${endHour}:${endMin}`;
  const durationMinutes = Math.max(1, Math.round((endDate.getTime() - startDate.getTime()) / 60000));

  const normalized = ensureAppointmentParamsLength(selectedAppointmentParams);
  normalized[0] = startDateTime;
  normalized[1] = endDateTime;
  normalized[4] = String(durationMinutes);
  selectedAppointmentParams = normalized;
  log(`Appointment times set: ${startDateTime} to ${endDateTime} (${durationMinutes} min)`);
});

loadSlotsBtn.addEventListener('click', loadAvailableSlots);

// Set default appointment date to tomorrow
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const tomorrowStr = tomorrow.toISOString().split('T')[0];
appointmentDateInput.value = tomorrowStr;

loadPatients();
loadClinics();
initializeRequestUserFromJwt();

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  log('Running...');

  const data = new FormData(form);

  let payload;
  try {
    const appointmentParams = ensureAppointmentParamsLength(selectedAppointmentParams);

    // APPADD piece 3 (index 2) is patient DFN.
    appointmentParams[2] = String(selectedPatient?.dfn || '');
    // APPADD piece 4 (index 3) is resource IEN.
    appointmentParams[3] = String(selectedResourceIen || '');
    // APPADD piece 18 (index 17) is clinic IEN.
    appointmentParams[17] = String(selectedClinic?.clinicIen || '');

    const requestUserName = String(data.get('requestUserName') || '').trim();
    const requestPriority = String(data.get('requestPriority') || '').trim();

    payload = {
      consultIen: String(data.get('consultIen') || '').trim(),
      requestUserName,
      requestPriority,
      appointmentParams
    };

    if (!selectedPatient || !selectedPatient.dfn) {
      throw new Error('Select a patient from the default patient list');
    }

    if (!selectedClinic || !selectedClinic.clinicIen) {
      throw new Error('Select a clinic from the clinic list');
    }

    if (!selectedResourceIen) {
      throw new Error('Resource IEN could not be resolved for selected clinic');
    }

    if (!payload.appointmentParams[0] || !payload.appointmentParams[1]) {
      throw new Error('Select an available time slot before running');
    }

    payload.requestParams = buildDefaultRequestParams({
      patientDfn: String(selectedPatient.dfn),
      clinicIen: String(selectedClinic.clinicIen),
      clinicName: String(selectedClinic.clinicName || ''),
      requestUserName: payload.requestUserName,
      requestPriority: payload.requestPriority,
      appointmentParams: payload.appointmentParams
    });

    if (!payload.consultIen) {
      delete payload.consultIen;
    }
  } catch (err) {
    log(err.message);
    return;
  }

  try {
    const response = await fetch('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const body = await response.json();
    log(JSON.stringify(body, null, 2));
  } catch (err) {
    log(err.message);
  }
});

// Make selectPatientFromSearch globally accessible for onclick handlers
window.selectPatientFromSearch = selectPatientFromSearch;
