import { prisma } from '../db.js';
import { writeAudit } from './audit.js';

export interface DefaultRank {
  name: string;
  beltColor: string;
  stripeColor?: string;
  stripeCount?: number;
  shortCode?: string;
  aliases?: string[];
}

const BLACK_STRIPE = '#111827';
const GOLD_STRIPE = '#f59e0b';
const DAN_NAMES = ['Shodan', 'Nidan', 'Sandan', 'Yondan', 'Godan', 'Rokudan', 'Shichidan', 'Hachidan', 'Kyudan', 'Jyudan'];

/** Full kyokushin belt ladder: kyu belts (some with a black stripe) + black-belt dans (yellow stripes). */
export const DEFAULT_RANKS: DefaultRank[] = [
  { name: 'White', beltColor: '#f8fafc', shortCode: 'Mukyu', aliases: ['white', 'белый', 'mukyu'] },
  { name: 'Orange', beltColor: '#fb923c', shortCode: '10 kyu', aliases: ['orange', 'оранжевый', '10 kyu'] },
  { name: 'Orange / black stripe', beltColor: '#fb923c', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '9 kyu', aliases: ['orange stripe', 'оранжевый с полосой', '9 kyu'] },
  { name: 'Blue', beltColor: '#3b82f6', shortCode: '8 kyu', aliases: ['blue', 'синий', '8 kyu'] },
  { name: 'Blue / black stripe', beltColor: '#3b82f6', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '7 kyu', aliases: ['blue stripe', 'синий с полосой', '7 kyu'] },
  { name: 'Yellow', beltColor: '#facc15', shortCode: '6 kyu', aliases: ['yellow', 'жёлтый', 'желтый', '6 kyu'] },
  { name: 'Yellow / black stripe', beltColor: '#facc15', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '5 kyu', aliases: ['yellow stripe', 'жёлтый с полосой', '5 kyu'] },
  { name: 'Green', beltColor: '#22c55e', shortCode: '4 kyu', aliases: ['green', 'зелёный', 'зеленый', '4 kyu'] },
  { name: 'Green / black stripe', beltColor: '#22c55e', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '3 kyu', aliases: ['green stripe', 'зелёный с полосой', '3 kyu'] },
  { name: 'Brown', beltColor: '#92400e', shortCode: '2 kyu', aliases: ['brown', 'коричневый', '2 kyu'] },
  { name: 'Brown / black stripe', beltColor: '#92400e', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '1 kyu', aliases: ['brown stripe', 'коричневый с полосой', '1 kyu'] },
  ...DAN_NAMES.map((nm, i) => ({
    name: `Black ${i + 1} Dan`,
    beltColor: '#111827',
    stripeColor: GOLD_STRIPE,
    stripeCount: i + 1,
    shortCode: nm,
    aliases: [`${i + 1} dan`, nm.toLowerCase(), ...(i === 0 ? ['black', 'чёрный', 'черный'] : [])],
  })),
];

let cachedEventId: number | null = null;

/** The single active event. Created lazily if missing. */
export async function getActiveEventId(): Promise<number> {
  if (cachedEventId != null) return cachedEventId;
  let event = await prisma.event.findFirst({ orderBy: { id: 'asc' } });
  if (!event) event = await prisma.event.create({ data: {} });
  cachedEventId = event.id;
  return event.id;
}

export function clearEventCache(): void {
  cachedEventId = null;
}

export async function seedDefaultRanks(eventId: number): Promise<void> {
  for (let i = 0; i < DEFAULT_RANKS.length; i++) {
    const r = DEFAULT_RANKS[i];
    await prisma.rank.create({
      data: {
        eventId,
        name: r.name,
        beltColor: r.beltColor,
        stripeColor: r.stripeColor ?? null,
        stripeCount: r.stripeCount ?? 0,
        shortCode: r.shortCode,
        order: i,
        aliases: { create: (r.aliases ?? []).map((value) => ({ value })) },
      },
    });
  }
}

/** Reset event data: fighters, categories, brackets, results, imports. Keeps ranks/users/branding. */
export async function resetEventData(eventId: number, userId?: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.fighter.deleteMany({ where: { eventId } });
    await tx.category.deleteMany({ where: { eventId } }); // cascades entries/allowedRanks/bracket/matches/placements
    await tx.importBatch.deleteMany({ where: { eventId } });
  });
  await writeAudit({ userId, entity: 'event', entityId: String(eventId), action: 'reset_data' });
}

/** Full reset: factory defaults except the admin account. */
export async function fullReset(eventId: number, userId?: number): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.fighter.deleteMany({ where: { eventId } });
    await tx.category.deleteMany({ where: { eventId } });
    await tx.importBatch.deleteMany({ where: { eventId } });
    await tx.tatami.deleteMany({ where: { eventId } });
    await tx.rank.deleteMany({ where: { eventId } });
    // Delete non-admin users.
    await tx.user.deleteMany({ where: { role: { not: 'admin' } } });
    await tx.event.update({
      where: { id: eventId },
      data: { title: 'Karate Tournament', subtitle: null, logoPath: null, accentColor: '#e11d48', bronzeMode: 'single', defaultTatamiImage: null },
    });
  });
  await seedDefaultRanks(eventId);
  await writeAudit({ userId, entity: 'event', entityId: String(eventId), action: 'full_reset' });
}
