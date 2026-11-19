import { addDays, compareDays, toIso, todayIn } from '../dates.js';
import { getSlotBlocks, resolveClinic } from '../vista/scheduling.js';

// Each APPSLOTS call covers at most this many days; longer ranges are fetched in consecutive windows.
export const CHUNK_DAYS = 31;

export function chunkRange(fromDay, toDay) {
  const chunks = [];
  for (let start = fromDay; compareDays(start, toDay) <= 0; start = addDays(start, CHUNK_DAYS)) {
    const end = addDays(start, CHUNK_DAYS - 1);
    chunks.push({ from: start, to: compareDays(end, toDay) > 0 ? toDay : end });
  }
  return chunks;
}

// A day with no coded block has no availability pattern and is left out; blank-code rows are the non-bookable remainder.
export function groupDays(blocks) {
  const byDate = new Map();
  for (const b of blocks) {
    const date = toIso(b.day);
    if (!byDate.has(date)) byDate.set(date, { date, blocks: [] });
    byDate.get(date).blocks.push({ start: b.start, end: b.end, code: b.code, open: b.open });
  }
  return [...byDate.values()]
    .filter((d) => d.blocks.some((b) => b.code !== ''))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({
      ...d,
      blocks: d.blocks.sort((a, b) => a.start.localeCompare(b.start)),
      openSlots: d.blocks.reduce((n, b) => n + b.open, 0)
    }));
}

export default async function availability(ctx) {
  const s = ctx.settings;
  const fromDay = s.fromDay || todayIn(s.tz, ctx.now);
  const toDay = s.toDay || addDays(fromDay, s.days);

  const clinic = await resolveClinic(ctx, s.clinic);
  const blocks = [];
  for (const chunk of chunkRange(fromDay, toDay)) {
    blocks.push(...await getSlotBlocks(ctx.rpc, clinic.resourceIen, chunk.from, chunk.to));
  }
  const days = groupDays(blocks);

  return {
    clinicIen: clinic.clinicIen,
    clinicName: clinic.name,
    resourceIen: clinic.resourceIen,
    from: toIso(fromDay),
    to: toIso(toDay),
    totalOpenSlots: days.reduce((n, d) => n + d.openSlots, 0),
    days
  };
}
