// Plain-text table for a patient's appointments.

const COLUMNS = [
  ['DATE/TIME', 'dateTime'],
  ['CLINIC', 'clinicName'],
  ['STATUS', 'status'],
  ['IEN', 'ien'],
  ['SCHEDULED BY', 'scheduledBy'],
  ['CANCELLED BY', 'cancelledBy']
];

export function renderAppointmentsTable(appointments) {
  const widths = COLUMNS.map(([title, key]) => Math.max(title.length, ...appointments.map((a) => String(a[key] ?? '').length)));
  const line = (cells) => cells.map((cell, i) => String(cell).padEnd(widths[i])).join('  ').trimEnd();
  return [
    line(COLUMNS.map(([title]) => title)),
    line(widths.map((w) => '-'.repeat(w))),
    ...appointments.map((a) => line(COLUMNS.map(([, key]) => a[key] ?? '')))
  ];
}
