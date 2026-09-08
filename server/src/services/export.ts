import * as XLSX from 'xlsx';
import { prisma } from '../db.js';

function toBuffer(wb: XLSX.WorkBook): Buffer {
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/** Full roster as a single sheet. */
export async function rosterWorkbook(eventId: number): Promise<Buffer> {
  const fighters = await prisma.fighter.findMany({
    where: { eventId },
    include: { rank: true, teacherRank: true },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  });
  const rows = fighters.map((f) => ({
    first_name: f.firstName,
    last_name: f.lastName,
    school: f.school ?? '',
    teacher_name: f.teacherName ?? '',
    teacher_rank: f.teacherRank?.name ?? '',
    rank: f.rank.name,
    age: f.age,
    weight: f.weight,
    gender: f.gender ?? '',
    city: f.city ?? '',
    country: f.country ?? '',
    notes: f.notes ?? '',
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Roster');
  return toBuffer(wb);
}

/** One sheet per category with its start list (seeded order). */
export async function startListsWorkbook(eventId: number): Promise<Buffer> {
  const categories = await prisma.category.findMany({
    where: { eventId },
    include: {
      tatami: true,
      entries: { include: { fighter: { include: { rank: true } } }, orderBy: { seed: 'asc' } },
    },
    orderBy: { order: 'asc' },
  });
  const wb = XLSX.utils.book_new();
  if (categories.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No categories']]), 'Empty');
  categories.forEach((c, i) => {
    const rows = c.entries.map((e) => ({
      seed: e.seed,
      name: `${e.fighter.firstName} ${e.fighter.lastName}`,
      school: e.fighter.school ?? '',
      rank: e.fighter.rank.name,
      age: e.fighter.age,
      weight: e.fighter.weight,
    }));
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ seed: '', name: '(no fighters)' }]);
    const safeName = `${i + 1}. ${c.name}`.slice(0, 28).replace(/[\\/*?:[\]]/g, ' ');
    XLSX.utils.book_append_sheet(wb, sheet, safeName);
  });
  return toBuffer(wb);
}

/** Results grouped by tatami: each category with its final placements. */
export async function resultsWorkbook(eventId: number): Promise<Buffer> {
  const tatamis = await prisma.tatami.findMany({ where: { eventId }, orderBy: { order: 'asc' } });
  const categories = await prisma.category.findMany({
    where: { eventId },
    include: { placements: { orderBy: { place: 'asc' } } },
    orderBy: { order: 'asc' },
  });
  const fighterIds = categories.flatMap((c) => c.placements.map((p) => p.fighterId));
  const fighters = await prisma.fighter.findMany({ where: { id: { in: fighterIds } } });
  const nameOf = new Map(fighters.map((f) => [f.id, `${f.firstName} ${f.lastName}`]));

  const wb = XLSX.utils.book_new();
  const groups = [{ id: null as number | null, name: 'Unassigned' }, ...tatamis.map((t) => ({ id: t.id as number | null, name: t.name }))];
  for (const g of groups) {
    const cats = categories.filter((c) => c.tatamiId === g.id);
    if (cats.length === 0) continue;
    const rows: any[] = [];
    for (const c of cats) {
      for (const p of c.placements) {
        rows.push({ category: c.name, place: p.place, fighter: nameOf.get(p.fighterId) ?? p.fighterId });
      }
      if (c.placements.length === 0) rows.push({ category: c.name, place: '', fighter: '(not finished)' });
    }
    const safe = g.name.slice(0, 28).replace(/[\\/*?:[\]]/g, ' ');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ category: '(none)' }]), safe);
  }
  if (wb.SheetNames.length === 0) XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['No results yet']]), 'Results');
  return toBuffer(wb);
}

/** Medal table: 1st/2nd/3rd per category. */
export async function medalTableWorkbook(eventId: number): Promise<Buffer> {
  const categories = await prisma.category.findMany({
    where: { eventId },
    include: { placements: { orderBy: { place: 'asc' } } },
    orderBy: { order: 'asc' },
  });
  const fighterIds = categories.flatMap((c) => c.placements.map((p) => p.fighterId));
  const fighters = await prisma.fighter.findMany({ where: { id: { in: fighterIds } }, include: { rank: true } });
  const info = new Map(fighters.map((f) => [f.id, f]));
  const rows = categories.map((c) => {
    const place = (n: number) => {
      const p = c.placements.find((x) => x.place === n);
      if (!p) return '';
      const f = info.get(p.fighterId);
      return f ? `${f.firstName} ${f.lastName}${f.school ? ' (' + f.school + ')' : ''}` : String(p.fighterId);
    };
    return { category: c.name, gold: place(1), silver: place(2), bronze: place(3), bronze2: place(4) };
  });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Medals');
  return toBuffer(wb);
}

/** Full JSON archive of the event (for backup before a reset). */
export async function archiveJson(eventId: number): Promise<Record<string, unknown>> {
  const [event, tatamis, ranks, users, fighters, categories, brackets, matches, placements, imports] = await Promise.all([
    prisma.event.findUnique({ where: { id: eventId } }),
    prisma.tatami.findMany({ where: { eventId } }),
    prisma.rank.findMany({ where: { eventId }, include: { aliases: true } }),
    prisma.user.findMany({ select: { id: true, username: true, role: true, displayName: true, active: true } }),
    prisma.fighter.findMany({ where: { eventId } }),
    prisma.category.findMany({ where: { eventId }, include: { allowedRanks: true, entries: true } }),
    prisma.bracket.findMany({ where: { category: { eventId } } }),
    prisma.match.findMany({ where: { bracket: { category: { eventId } } } }),
    prisma.placement.findMany({ where: { category: { eventId } } }),
    prisma.importBatch.findMany({ where: { eventId } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    event,
    tatamis,
    ranks,
    users,
    fighters,
    categories,
    brackets,
    matches,
    placements,
    imports,
  };
}
