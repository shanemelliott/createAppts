// VistA availability display: hour columns, one row per day, per-increment codes in brackets.
import { fromIso, monthHeading, weekdayCode } from '../dates.js';

export const LEGEND = [
  'FOR CLINIC AVAILABILITY PATTERNS:',
  '',
  '    0-9 and j-z --denote available slots where j=10,k=11...z=26',
  '            A-W --denote overbooks with A being the first slot to be overbooked',
  '                  and B being the second for that same time, etc.',
  "      *,$,!,@,# --denote overbooks or appts. that fall outside of a clinic's",
  '                  regular hours.'
];

const LABEL_WIDTH = 7;
const MIN_COLUMN = 7;

const hourLabel = (hour) => String(hour % 12 === 0 ? 12 : hour % 12);
const hourOf = (hhmm) => Number(hhmm.slice(0, 2));

// Returns pages of text lines. pageSize 0 means one page.
export function buildGrid(days, { pageSize = 0 } = {}) {
  const coded = (day) => day.blocks.filter((b) => b.code !== '');
  const hours = days.flatMap((d) => coded(d).map((b) => hourOf(b.start)));
  if (!hours.length) return { pages: [], rowCount: 0 };

  const first = Math.min(...hours);
  const last = Math.max(...hours);
  const columns = Array.from({ length: last - first + 1 }, (_, i) => first + i);

  const rows = days.map((d) => {
    const date = fromIso(d.date);
    const cells = columns.map((h) => {
      const codes = coded(d).filter((b) => hourOf(b.start) === h).map((b) => b.code).join('');
      return codes ? `[${codes}]` : '';
    });
    return { date, label: `${weekdayCode(date)} ${String(date.day).padStart(2)}`, cells };
  });

  const width = Math.max(MIN_COLUMN, ...rows.flatMap((r) => r.cells.map((c) => c.length + 1)));
  const header = [
    'TIME'.padEnd(LABEL_WIDTH) + columns.map((h) => `|${hourLabel(h).padEnd(width)}`).join(''),
    'DATE'.padEnd(LABEL_WIDTH) + columns.map(() => `|${''.padEnd(width)}`).join('')
  ];
  const rowLine = (r) => (r.label.padEnd(LABEL_WIDTH) + r.cells.map((c) => `|${c.padEnd(width)}`).join('')).trimEnd();

  const size = pageSize > 0 ? pageSize : rows.length;
  const pages = [];
  for (let i = 0; i < rows.length; i += size) {
    const lines = [...header];
    let month = '';
    for (const r of rows.slice(i, i + size)) {
      const heading = monthHeading(r.date);
      if (heading !== month) {
        lines.push(`-- ${heading} --`);
        month = heading;
      }
      lines.push(rowLine(r));
    }
    pages.push(lines);
  }
  return { pages, rowCount: rows.length };
}

// Writes the grid, pausing between pages when interactive, then the legend (also after a quit).
export async function printAvailabilityGrid({ write, days, pageSize, interactive, readLine }) {
  const { pages } = buildGrid(days, { pageSize: interactive ? pageSize : 0 });
  for (let i = 0; i < pages.length; i += 1) {
    write(`${pages[i].join('\n')}\n`);
    if (interactive && i < pages.length - 1) {
      write('\nPRESS RETURN TO CONTINUE OR ^ TO QUIT ');
      const answer = await readLine();
      if (answer === null || answer.trim() === '^') break;
    }
  }
  write(`\n${LEGEND.join('\n')}\n`);
}
