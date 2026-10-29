// Open Slots tab - SDEC APPSLOTS over a date range
(() => {
  const startInput = document.getElementById('os-start-date');
  const endInput = document.getElementById('os-end-date');
  const loadBtn = document.getElementById('os-load-btn');
  const resultsContainer = document.getElementById('os-results-container');
  const messages = document.getElementById('os-messages');
  const selectedClinicText = document.getElementById('os-selected-clinic-text');
  const rawDetails = document.getElementById('os-raw-details');
  const rawOutput = document.getElementById('os-raw-output');

  const DEFAULT_DAYS = 30;

  function toDateInputValue(date) {
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${month}-${day}`;
  }

  function setDefaults() {
    const today = new Date();
    const end = new Date(today);
    end.setDate(end.getDate() + DEFAULT_DAYS);
    startInput.value = toDateInputValue(today);
    endInput.value = toDateInputValue(end);
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function showMessage(text, isError) {
    messages.innerHTML = text
      ? `<div class="alert ${isError ? 'alert-error' : 'alert-success'}">${escapeHtml(text)}</div>`
      : '';
  }

  function getSelectedClinic() {
    try {
      return typeof selectedClinic !== 'undefined' ? selectedClinic : null;
    } catch (err) {
      return null;
    }
  }

  function refreshSelectedClinic() {
    const clinic = getSelectedClinic();
    selectedClinicText.textContent = clinic && clinic.clinicIen
      ? `${clinic.clinicName} (IEN ${clinic.clinicIen})`
      : 'None \u2014 select a clinic on the Appointments tab';
  }

  function formatTime(hhmm) {
    return `${hhmm.slice(0, 2)}:${hhmm.slice(2)}`;
  }

  function renderDays(days) {
    if (!days.length) {
      resultsContainer.innerHTML = '<p class="text-muted">No slots found for this date range</p>';
      return;
    }

    const rows = days.map((day) => {
      const slots = day.slots.filter((slot) => slot.code !== '').map((slot) => {
        const cls = slot.open === null ? 'os-slot os-slot-over' : slot.open > 0 ? 'os-slot os-slot-open' : 'os-slot os-slot-full';
        const count = slot.open === null ? slot.code : String(slot.open);
        return `<span class="${cls}" title="${formatTime(slot.start)}-${formatTime(slot.end)}">${formatTime(slot.start)} (${escapeHtml(count)})</span>`;
      }).join('');

      return `
        <tr>
          <td class="os-day">${escapeHtml(day.label)}<br /><small>${escapeHtml(day.date)}</small></td>
          <td>${day.openSlots}</td>
          <td>${slots}</td>
        </tr>`;
    }).join('');

    resultsContainer.innerHTML = `
      <table class="os-table">
        <thead><tr><th>Day</th><th>Open</th><th>Slots: start time (open count)</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  async function loadOpenSlots() {
    const clinic = getSelectedClinic();
    if (!clinic || !clinic.clinicIen) {
      showMessage('Select a clinic on the Appointments tab first.', true);
      return;
    }
    if (!startInput.value || !endInput.value || endInput.value < startInput.value) {
      showMessage('Choose a valid start and end date.', true);
      return;
    }

    loadBtn.disabled = true;
    showMessage('Loading open slots...', false);
    try {
      const url = `/api/lookups/clinics/${encodeURIComponent(clinic.clinicIen)}/open-slots`
        + `?start=${encodeURIComponent(startInput.value)}&end=${encodeURIComponent(endInput.value)}`;
      const response = await fetch(url);
      const body = await response.json();
      if (!response.ok || !body.success) {
        throw new Error(body.error || 'Failed to load open slots');
      }

      renderDays(body.days);
      rawOutput.textContent = body.raw;
      rawDetails.classList.remove('hidden');
      showMessage(`${body.count} clinic day(s) between ${body.start} and ${body.end}`, false);
    } catch (err) {
      showMessage(err.message, true);
      resultsContainer.innerHTML = '<p class="text-muted">No slots loaded</p>';
    } finally {
      loadBtn.disabled = false;
    }
  }

  loadBtn.addEventListener('click', loadOpenSlots);

  document.addEventListener('DOMContentLoaded', () => {
    const tabButton = document.querySelector('.nav-tab[data-tab="open-slots"]');
    if (tabButton) {
      tabButton.addEventListener('click', refreshSelectedClinic);
    }
  });

  setDefaults();
  refreshSelectedClinic();
})();
