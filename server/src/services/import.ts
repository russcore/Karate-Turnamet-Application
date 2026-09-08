import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import iconv from 'iconv-lite';
import { prisma } from '../db.js';
import { writeAudit } from './audit.js';

export const CANONICAL_FIELDS = [
  'first_name',
  'last_name',
  'school',
  'teacher_name',
  'teacher_rank',
  'rank',
  'age',
  'weight',
  'gender',
  'city',
  'country',
] as const;
export type CanonicalField = (typeof CANONICAL_FIELDS)[number];
const REQUIRED: CanonicalField[] = ['first_name', 'last_name', 'rank', 'age', 'weight'];
const MIN_AGE = 5;
const MIN_WEIGHT = 10;

const EXAMPLE_ROW: Record<CanonicalField, string> = {
  first_name: 'Ivan',
  last_name: 'Petrov',
  school: 'Bushido Dojo',
  teacher_name: 'Sensei Sato',
  teacher_rank: 'Black 1 Dan',
  rank: 'Green',
  age: '12',
  weight: '38',
  gender: 'M',
  city: 'Kyiv',
  country: 'UA',
};

// Ten realistic example fighters for the template — varied age (5–18), weight, gender,
// school, teacher and city. `rank` / `teacher_rank` are filled in from the event's real
// configured belts (see buildExampleRows) so the sample always imports cleanly.
interface ExamplePerson {
  first_name: string;
  last_name: string;
  school: string;
  teacher_name: string;
  age: string;
  weight: string;
  gender: string;
  city: string;
  country: string;
}
const EXAMPLE_PEOPLE: ExamplePerson[] = [
  { first_name: 'Ivan', last_name: 'Petrov', school: 'Bushido Dojo', teacher_name: 'Sensei Sato', age: '12', weight: '38', gender: 'M', city: 'Kyiv', country: 'UA' },
  { first_name: 'Olena', last_name: 'Kovalenko', school: 'Sakura Club', teacher_name: 'Sensei Ito', age: '8', weight: '24', gender: 'F', city: 'Warsaw', country: 'PL' },
  { first_name: 'Dmytro', last_name: 'Shevchenko', school: 'Bushido Dojo', teacher_name: 'Sensei Sato', age: '15', weight: '58', gender: 'M', city: 'Almaty', country: 'KZ' },
  { first_name: 'Anna', last_name: 'Bondarenko', school: 'Dragon Karate', teacher_name: 'Sensei Yamada', age: '6', weight: '18', gender: 'F', city: 'Odesa', country: 'UA' },
  { first_name: 'Maksym', last_name: 'Tkachenko', school: 'Sakura Club', teacher_name: 'Sensei Ito', age: '10', weight: '30', gender: 'M', city: 'Chisinau', country: 'MD' },
  { first_name: 'Sofiia', last_name: 'Melnyk', school: 'Dragon Karate', teacher_name: 'Sensei Yamada', age: '13', weight: '45', gender: 'F', city: 'Tbilisi', country: 'GE' },
  { first_name: 'Andrii', last_name: 'Kravchenko', school: 'Bushido Dojo', teacher_name: 'Sensei Sato', age: '17', weight: '68', gender: 'M', city: 'Kharkiv', country: 'UA' },
  { first_name: 'Yuliia', last_name: 'Polishchuk', school: 'Sakura Club', teacher_name: 'Sensei Ito', age: '11', weight: '34', gender: 'F', city: 'Vilnius', country: 'LT' },
  { first_name: 'Mykyta', last_name: 'Boyko', school: 'Dragon Karate', teacher_name: 'Sensei Yamada', age: '7', weight: '22', gender: 'M', city: 'Tel Aviv', country: 'IL' },
  { first_name: 'Kateryna', last_name: 'Marchenko', school: 'Bushido Dojo', teacher_name: 'Sensei Sato', age: '16', weight: '55', gender: 'F', city: 'Bucharest', country: 'RO' },
];

/** Build the example rows, drawing rank + teacher_rank from the event's real configured belts. */
function buildExampleRows(rankNames: string[]): Record<CanonicalField, string>[] {
  const belts = rankNames.length ? rankNames : [EXAMPLE_ROW.rank];
  // Fighters get realistic belts: kids/teens sit in the lower ~60% of the list (kyu belts, incl.
  // the striped ones), youngest → White, oldest → up to ~Brown/1st Dan. Never a kid at 8th Dan.
  const cap = Math.max(1, Math.ceil(belts.length * 0.6));
  const byAge = [...EXAMPLE_PEOPLE].sort((a, b) => Number(a.age) - Number(b.age));
  const beltOf = new Map<ExamplePerson, string>();
  byAge.forEach((p, i) => {
    const idx = byAge.length > 1 ? Math.round((i * (cap - 1)) / (byAge.length - 1)) : 0;
    beltOf.set(p, belts[idx]);
  });
  return EXAMPLE_PEOPLE.map((p, i) => {
    const rank = beltOf.get(p) ?? belts[0];
    // Teachers are senior: cycle through the top three configured ranks (all recognized on import).
    const teacher_rank = belts[Math.max(0, belts.length - 1 - (i % 3))];
    return { ...p, rank, teacher_rank } as Record<CanonicalField, string>;
  });
}

/** Decode a raw file buffer as UTF-8, falling back to Windows-1251 when it looks garbled. */
export function decodeBuffer(buf: Buffer): string {
  // Strip UTF-8 BOM.
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return buf.slice(3).toString('utf8');
  }
  const utf8 = buf.toString('utf8');
  if (utf8.includes('�')) return iconv.decode(buf, 'win1251');
  return utf8;
}

export interface ParsedUpload {
  columns: string[];
  rows: Record<string, string>[];
}

/** Parse an uploaded .xlsx or .csv file into columns + string rows. */
export function parseUpload(buf: Buffer, filename: string): ParsedUpload {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const aoa = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, raw: false, defval: '' });
    if (aoa.length === 0) return { columns: [], rows: [] };
    const columns = (aoa[0] as string[]).map((c) => String(c).trim());
    const rows = aoa.slice(1).map((arr) => {
      const rec: Record<string, string> = {};
      columns.forEach((c, i) => (rec[c] = String((arr as string[])[i] ?? '').trim()));
      return rec;
    });
    return { columns, rows: rows.filter((r) => Object.values(r).some((v) => v !== '')) };
  }
  // CSV / TSV — auto-detect delimiter, handle UTF-8 + Windows-1251.
  const text = decodeBuffer(buf);
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  const columns = parsed.meta.fields ?? [];
  const rows = (parsed.data as Record<string, string>[]).map((r) => {
    const rec: Record<string, string> = {};
    for (const c of columns) rec[c] = String(r[c] ?? '').trim();
    return rec;
  });
  return { columns, rows };
}

/** Suggest a mapping from canonical fields to actual columns by fuzzy header match. */
export function suggestMapping(columns: string[]): Partial<Record<CanonicalField, string>> {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, '');
  const map: Partial<Record<CanonicalField, string>> = {};
  const synonyms: Record<CanonicalField, string[]> = {
    first_name: ['firstname', 'name', 'имя'],
    last_name: ['lastname', 'surname', 'фамилия'],
    school: ['school', 'dojo', 'club', 'школа', 'клуб'],
    teacher_name: ['teachername', 'teacher', 'coach', 'sensei', 'тренер'],
    teacher_rank: ['teacherrank', 'coachrank'],
    rank: ['rank', 'belt', 'kyu', 'dan', 'пояс', 'разряд'],
    age: ['age', 'возраст'],
    weight: ['weight', 'вес'],
    gender: ['gender', 'sex', 'пол'],
    city: ['city', 'город'],
    country: ['country', 'страна'],
  };
  for (const field of CANONICAL_FIELDS) {
    const col = columns.find((c) => norm(c) === field.replace('_', '')) ??
      columns.find((c) => synonyms[field].includes(norm(c)));
    if (col) map[field] = col;
  }
  return map;
}

function normalizeGender(v: string): string | null {
  const s = v.trim().toLowerCase();
  if (['m', 'male', 'м', 'муж', 'boy'].includes(s)) return 'M';
  if (['f', 'female', 'ж', 'жен', 'girl', 'w'].includes(s)) return 'F';
  return null;
}

export interface RankIndex {
  byKey: Map<string, number>; // normalized name/alias -> rankId
}

export async function buildRankIndex(eventId: number): Promise<RankIndex> {
  const ranks = await prisma.rank.findMany({ where: { eventId }, include: { aliases: true } });
  const byKey = new Map<string, number>();
  const norm = (s: string) => s.trim().toLowerCase();
  for (const r of ranks) {
    byKey.set(norm(r.name), r.id);
    if (r.shortCode) byKey.set(norm(r.shortCode), r.id);
    for (const a of r.aliases) byKey.set(norm(a.value), r.id);
  }
  return { byKey };
}

export interface NormalizedRow {
  index: number; // original row number (1-based, excluding header)
  firstName: string;
  lastName: string;
  school: string | null;
  teacherName: string | null;
  teacherRankId: number | null;
  rankRaw: string;
  rankId: number | null;
  age: number | null;
  weight: number | null;
  gender: string | null;
  city: string | null;
  country: string | null;
  notes: string | null;
  errors: string[];
  warnings: string[];
}

export interface PreviewResult {
  rows: NormalizedRow[];
  unknownRanks: string[];
  okCount: number;
  errorCount: number;
}

/** Validate + normalize rows against a column mapping and the configured ranks. */
export function validateRows(
  rawRows: Record<string, string>[],
  mapping: Partial<Record<CanonicalField, string>>,
  rankIndex: RankIndex,
  extraRankMap: Record<string, number> = {}, // raw rank value -> rankId (from user mapping)
): PreviewResult {
  const get = (row: Record<string, string>, field: CanonicalField): string =>
    mapping[field] ? (row[mapping[field]!] ?? '').trim() : '';
  const normRank = (s: string) => s.trim().toLowerCase();
  const seen = new Map<string, number>();
  const unknownRanks = new Set<string>();
  const rows: NormalizedRow[] = [];

  rawRows.forEach((raw, i) => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const firstName = get(raw, 'first_name');
    const lastName = get(raw, 'last_name');
    const school = get(raw, 'school') || null;
    const rankRaw = get(raw, 'rank');
    const ageStr = get(raw, 'age');
    const weightStr = get(raw, 'weight');

    for (const req of REQUIRED) {
      const val = get(raw, req);
      if (!val) errors.push(`Missing ${req}`);
    }

    const age = ageStr ? Number(ageStr.replace(',', '.')) : null;
    if (ageStr && (!Number.isFinite(age) || age! <= 0)) errors.push(`Invalid age "${ageStr}"`);
    else if (age != null && age < MIN_AGE) warnings.push(`Age ${age} is below ${MIN_AGE} — please check`);
    const weight = weightStr ? Number(weightStr.replace(',', '.')) : null;
    if (weightStr && (!Number.isFinite(weight) || weight! <= 0)) errors.push(`Invalid weight "${weightStr}"`);
    else if (weight != null && weight < MIN_WEIGHT) warnings.push(`Weight ${weight}kg is below ${MIN_WEIGHT} — please check`);

    let rankId: number | null = null;
    if (rankRaw) {
      rankId = extraRankMap[rankRaw] ?? rankIndex.byKey.get(normRank(rankRaw)) ?? null;
      if (rankId == null) {
        unknownRanks.add(rankRaw);
        errors.push(`Unknown rank "${rankRaw}"`);
      }
    }

    const teacherRankRaw = get(raw, 'teacher_rank');
    const teacherRankId = teacherRankRaw ? rankIndex.byKey.get(normRank(teacherRankRaw)) ?? null : null;
    if (teacherRankRaw && teacherRankId == null) warnings.push(`Teacher rank "${teacherRankRaw}" not recognized (ignored)`);

    const dupKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${(school ?? '').toLowerCase()}`;
    if (seen.has(dupKey)) warnings.push(`Possible duplicate of row ${seen.get(dupKey)}`);
    else seen.set(dupKey, i + 1);

    rows.push({
      index: i + 1,
      firstName,
      lastName,
      school,
      teacherName: get(raw, 'teacher_name') || null,
      teacherRankId,
      rankRaw,
      rankId,
      age,
      weight,
      gender: normalizeGender(get(raw, 'gender')),
      city: get(raw, 'city') || null,
      country: get(raw, 'country') || null,
      notes: null,
      errors,
      warnings,
    });
  });

  const errorCount = rows.filter((r) => r.errors.length > 0).length;
  return { rows, unknownRanks: [...unknownRanks], okCount: rows.length - errorCount, errorCount };
}

/** Commit valid rows in a single transaction (never partial). Records an ImportBatch. */
export async function commitImport(
  eventId: number,
  rows: NormalizedRow[],
  filename: string,
  userId?: number,
): Promise<{ imported: number; skipped: number; batchId: number }> {
  const good = rows.filter((r) => r.errors.length === 0 && r.rankId != null && r.age != null && r.weight != null);
  const skipped = rows.length - good.length;

  const batchId = await prisma.$transaction(async (tx) => {
    // Chunked createMany for 200+ rows without timing out.
    const data = good.map((r) => ({
      eventId,
      firstName: r.firstName,
      lastName: r.lastName,
      school: r.school,
      teacherName: r.teacherName,
      teacherRankId: r.teacherRankId,
      rankId: r.rankId!,
      age: r.age!,
      weight: r.weight!,
      gender: r.gender,
      city: r.city,
      country: r.country,
      notes: r.notes,
    }));
    for (let i = 0; i < data.length; i += 200) {
      await tx.fighter.createMany({ data: data.slice(i, i + 200) });
    }
    const batch = await tx.importBatch.create({
      data: { eventId, filename, rowCount: rows.length, okCount: good.length, errorCount: skipped, byUserId: userId ?? null },
    });
    return batch.id;
  });

  await writeAudit({ userId, entity: 'import', entityId: String(batchId), action: 'commit', after: { imported: good.length, skipped } });
  return { imported: good.length, skipped, batchId };
}

/** Build a downloadable template (.xlsx buffer or .csv string) with 10 examples + rank list. */
export async function buildTemplate(eventId: number, format: 'xlsx' | 'csv'): Promise<Buffer | string> {
  const ranks = await prisma.rank.findMany({ where: { eventId }, orderBy: { order: 'asc' }, include: { aliases: true } });
  // Ten example fighters, using the event's real configured belts so the sample imports cleanly.
  const examples = buildExampleRows(ranks.map((r) => r.name));
  const exampleRows = examples.map((ex) => CANONICAL_FIELDS.map((f) => ex[f] ?? ''));

  if (format === 'csv') {
    const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const lines = [CANONICAL_FIELDS.join(','), ...exampleRows.map((r) => r.map(cell).join(','))];
    return lines.join('\n') + '\n';
  }
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...CANONICAL_FIELDS], ...exampleRows]), 'Fighters');
  const ranksSheet = XLSX.utils.aoa_to_sheet([
    ['Belt / rank name — put one of these in the "rank" and "teacher_rank" columns', 'Short code', 'Also accepted (aliases)'],
    ...ranks.map((r) => [r.name, r.shortCode ?? '', r.aliases.map((a) => a.value).join(', ')]),
  ]);
  XLSX.utils.book_append_sheet(wb, ranksSheet, 'Ranks');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
