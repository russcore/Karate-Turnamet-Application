import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const ri = (a: number, b: number) => Math.floor(Math.random() * (b - a + 1)) + a;

async function main() {
  const event = await prisma.event.findFirst();
  if (!event) throw new Error('no event');

  // 1. Clear all categories -> tatamis become empty, everyone becomes ungrouped.
  await prisma.category.deleteMany({ where: { eventId: event.id } });

  // 2. Belts White -> Black 1 Dan only (order 0..11 in the kyokushin ladder). Global config untouched.
  const ranks = await prisma.rank.findMany({ where: { eventId: event.id }, orderBy: { order: 'asc' } });
  const pool = ranks.filter((r) => r.order <= 11);
  if (pool.length === 0) throw new Error('no ranks in White..1 Dan range');

  // 3. Rewrite each fighter: age 5-18, realistic weight for that age, belt capped by age.
  const fighters = await prisma.fighter.findMany({ where: { eventId: event.id } });
  for (const f of fighters) {
    const age = ri(5, 18);
    const gender = f.gender ?? (Math.random() < 0.5 ? 'M' : 'F');
    const mean = 3.3 * age * (gender === 'F' ? 0.95 : 1); // ~kg for age
    const weight = Math.max(15, Math.round(mean * (0.8 + Math.random() * 0.45)));
    const cap = Math.min(pool.length - 1, Math.max(1, age - 4)); // younger -> lower belts
    const rank = pool[ri(0, cap)];
    await prisma.fighter.update({ where: { id: f.id }, data: { age, weight, gender, rankId: rank.id } });
  }
  console.log(`Reset categories (tatamis empty). Rewrote ${fighters.length} fighters: age 5-18, belts ${pool[0].name}..${pool[pool.length - 1].name}, realistic weights.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
