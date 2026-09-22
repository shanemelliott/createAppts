// Patient Appointments tab - SDES GET APPTS BY PATIENT DFN3
(() => {
  const startInput = document.getElementById('pa-start-date');
  const endInput = document.getElementById('pa-end-date');
  const monthsInput = document.getElementById('pa-months');
  const loadBtn = document.getElementById('pa-load-btn');
  const resetBtn = document.getElementById('pa-reset-btn');
  const resultsContainer = document.getElementById('pa-results-container');
  const messages = document.getElementById('pa-messages');
  const selectedPatientText = document.getElementById('pa-selected-patient-text');
  const rawDetails = document.getElementById('pa-raw-details');
  const rawOutput = document.getElementById('pa-raw-output');

  const DEFAULT_MONTHS = 4;

  function toDateInputValue(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function addMonths(dateStr, months) {
    const [year, month, day] = dateStr.split('-').map(Number);
    const result = new Date(year, month - 1, day);
    result.setMonth(result.getMonth() + months);
    return toDateInputValue(result);
  }

  function setDefaults() {
    const today = toDateInputValue(new Date());
    startInput.value = today;
    monthsInput.value = String(DEFAULT_MONTHS);
    endInput.value = addMonths(today, DEFAULT_MONTHS);
  }

  function showMessage(text, isError) {
    messages.innerHTML = text
      ? `<div class="alert ${isError ? 'alert-error' : 'alert-success'}">${escapeHtml(text)}</div>`
      : '';
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function getSelectedPatient() {
    try {
      return typeof selectedPatient !== 'undefined' ? selectedPatient : null;
    } catch (err) {
      return null;
    }
  }

  function refreshSelectedPatient() {
    const patient = getSelectedPatient();
    selectedPatientText.textContent = patient && patient.dfn
      ? `${patient.name || 'Unknown'} (DFN: ${patient.dfn})`
      : 'None — select a patient on the Appointments tab';
  }

  function formatCell(value) {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) {
      return value.map(formatCell).filter(Boolean).join(', ');
    }
    if (typeof value === 'object') {
      return formatCell(value.Name ?? value.name ?? '');
    }
    return String(value).trim();
  }

  // RPC returns offsets without a colon (2026-11-11T08:15-0500), which Date cannot parse reliably.
  function parseApptDateTime(value) {
    if (!value) return null;
    const normalized = String(value).replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
    const parsed = new Date(normalized);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  function formatApptDateTime(value) {
    const parsed = parseApptDateTime(value);
    if (!parsed) return formatCell(value);
    return parsed.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function renderAppointments(appointments) {
    if (!appointments || appointments.length === 0) {
      resultsContainer.innerHTML = '<p class="text-muted">No appointments found in this timeframe</p>';
      return;
    }

    const rows = appointments
      .slice()
      .sort((a, b) => {
        const aTime = parseApptDateTime(a && a.AppointmentDateTime);
        const bTime = parseApptDateTime(b && b.AppointmentDateTime);
        return (bTime ? bTime.getTime() : 0) - (aTime ? aTime.getTime() : 0);
      })
      .map((appt) => ({
        dateTime: formatApptDateTime(appt && appt.AppointmentDateTime),
        clinic: formatCell(appt && (appt.Clinic || appt.Resource)),
        status: formatCell(appt && (appt.CurrentStatus || appt.Status)),
        ien: formatCell(appt && appt.AppointmentIEN),
        createdBy: formatCell(appt && (appt.DataEntryClerk || appt.SchedulerName)),
        cancelledBy: formatCell(appt && (appt.CancelledByUser || appt.NoShowCancelledBy))
      }));

    resultsContainer.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Appt Date/Time</th>
            <th>Clinic</th>
            <th>Status</th>
            <th>Appt IEN</th>
            <th>Created By</th>
            <th>Cancelled By</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.dateTime)}</td>
              <td>${escapeHtml(row.clinic)}</td>
              <td>${escapeHtml(row.status)}</td>
              <td>${escapeHtml(row.ien)}</td>
              <td>${escapeHtml(row.createdBy)}</td>
              <td>${escapeHtml(row.cancelledBy)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }

  async function loadAppointments() {
    const patient = getSelectedPatient();
    if (!patient || !patient.dfn) {
      showMessage('Select a patient on the Appointments tab first.', true);
      return;
    }
    if (!startInput.value || !endInput.value) {
      showMessage('Start and end dates are required.', true);
      return;
    }
    if (endInput.value < startInput.value) {
      showMessage('End date must be on or after the start date.', true);
      return;
    }

    loadBtn.disabled = true;
    showMessage('Loading appointments...', false);
    try {
      const url = `/api/lookups/patients/${encodeURIComponent(patient.dfn)}/appointments`
        + `?start=${encodeURIComponent(startInput.value)}&end=${encodeURIComponent(endInput.value)}`;
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Failed to load appointments');
      }

      renderAppointments(body.appointments);
      rawOutput.textContent = JSON.stringify(body.raw, null, 2);
      rawDetails.classList.remove('hidden');
      showMessage(`${body.count} appointment(s) between ${body.start} and ${body.end}`, false);
    } catch (err) {
      showMessage(err.message, true);
      resultsContainer.innerHTML = '<p class="text-muted">No appointments loaded</p>';
    } finally {
      loadBtn.disabled = false;
    }
  }

  monthsInput.addEventListener('change', () => {
    const months = Number(monthsInput.value);
    if (!startInput.value || !Number.isFinite(months) || months < 1) return;
    endInput.value = addMonths(startInput.value, Math.floor(months));
  });

  startInput.addEventListener('change', () => {
    const months = Number(monthsInput.value);
    if (!startInput.value || !Number.isFinite(months) || months < 1) return;
    endInput.value = addMonths(startInput.value, Math.floor(months));
  });

  loadBtn.addEventListener('click', loadAppointments);
  resetBtn.addEventListener('click', () => {
    setDefaults();
    showMessage('', false);
  });

  document.addEventListener('DOMContentLoaded', () => {
    const tabButton = document.querySelector('.nav-tab[data-tab="patient-appointments"]');
    if (tabButton) {
      tabButton.addEventListener('click', refreshSelectedPatient);
    }
  });

  setDefaults();
  refreshSelectedPatient();
})();
