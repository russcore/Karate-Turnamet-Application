import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const BLACK_STRIPE = '#111827';
const GOLD_STRIPE = '#f59e0b';
const DAN_NAMES = ['Shodan', 'Nidan', 'Sandan', 'Yondan', 'Godan', 'Rokudan', 'Shichidan', 'Hachidan', 'Kyudan', 'Jyudan'];

const DEFAULT_RANKS: { name: string; beltColor: string; stripeColor?: string; stripeCount?: number; shortCode?: string; aliases: string[] }[] = [
  { name: 'White', beltColor: '#f8fafc', shortCode: 'Mukyu', aliases: ['white', 'белый', 'mukyu'] },
  { name: 'Orange', beltColor: '#fb923c', shortCode: '10 kyu', aliases: ['orange', 'оранжевый', '10 kyu'] },
  { name: 'Orange / black stripe', beltColor: '#fb923c', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '9 kyu', aliases: ['orange stripe', '9 kyu'] },
  { name: 'Blue', beltColor: '#3b82f6', shortCode: '8 kyu', aliases: ['blue', 'синий', '8 kyu'] },
  { name: 'Blue / black stripe', beltColor: '#3b82f6', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '7 kyu', aliases: ['blue stripe', '7 kyu'] },
  { name: 'Yellow', beltColor: '#facc15', shortCode: '6 kyu', aliases: ['yellow', 'жёлтый', 'желтый', '6 kyu'] },
  { name: 'Yellow / black stripe', beltColor: '#facc15', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '5 kyu', aliases: ['yellow stripe', '5 kyu'] },
  { name: 'Green', beltColor: '#22c55e', shortCode: '4 kyu', aliases: ['green', 'зелёный', 'зеленый', '4 kyu'] },
  { name: 'Green / black stripe', beltColor: '#22c55e', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '3 kyu', aliases: ['green stripe', '3 kyu'] },
  { name: 'Brown', beltColor: '#92400e', shortCode: '2 kyu', aliases: ['brown', 'коричневый', '2 kyu'] },
  { name: 'Brown / black stripe', beltColor: '#92400e', stripeColor: BLACK_STRIPE, stripeCount: 1, shortCode: '1 kyu', aliases: ['brown stripe', '1 kyu'] },
  ...DAN_NAMES.map((nm, i) => ({
    name: `Black ${i + 1} Dan`,
    beltColor: '#111827',
    stripeColor: GOLD_STRIPE,
    stripeCount: i + 1,
    shortCode: nm,
    aliases: [`${i + 1} dan`, nm.toLowerCase(), ...(i === 0 ? ['black', 'чёрный', 'черный'] : [])],
  })),
];

const FIRST_NAMES = ['Ivan', 'Anna', 'Dmitry', 'Olga', 'Sergey', 'Maria', 'Alexei', 'Elena', 'Nikita', 'Sofia', 'Pavel', 'Yulia', 'Kirill', 'Daria', 'Roman', 'Vera'];
const LAST_NAMES = ['Petrov', 'Ivanova', 'Sidorov', 'Kuznetsova', 'Smirnov', 'Popova', 'Volkov', 'Fedorova', 'Morozov', 'Egorova', 'Sokolov', 'Novikova'];
const SCHOOLS = ['Bushido Dojo', 'Kyokushin Center', 'Ronin Club', 'Sakura Karate', 'Tiger Gym', 'Dragon School'];
const CITIES = ['Kyiv', 'Lviv', 'Odesa', 'Kharkiv', 'Dnipro'];

const rand = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number): number => Math.floor(Math.random() * (max - min + 1)) + min;

async function main(): Promise<void> {
  const demo = process.argv.includes('--demo');

  // Event
  let event = await prisma.event.findFirst({ orderBy: { id: 'asc' } });
  if (!event) {
    event = await prisma.event.create({ data: { title: 'Kyokushin Karate Open 2026', subtitle: 'IKO Style' } });
    console.log('Created event:', event.title);
  }

  // Ranks
  const rankCount = await prisma.rank.count({ where: { eventId: event.id } });
  if (rankCount === 0) {
    for (let i = 0; i < DEFAULT_RANKS.length; i++) {
      const r = DEFAULT_RANKS[i];
      await prisma.rank.create({
        data: {
          eventId: event.id,
          name: r.name,
          beltColor: r.beltColor,
          stripeColor: r.stripeColor ?? null,
          stripeCount: r.stripeCount ?? 0,
          shortCode: r.shortCode,
          order: i,
          aliases: { create: r.aliases.map((value) => ({ value })) },
        },
      });
    }
    console.log(`Seeded ${DEFAULT_RANKS.length} default ranks.`);
  }

  // Tatamis
  const tatamiCount = await prisma.tatami.count({ where: { eventId: event.id } });
  if (tatamiCount === 0) {
    for (let i = 1; i <= 3; i++) {
      await prisma.tatami.create({ data: { eventId: event.id, name: `Arena ${i}`, order: i - 1 } });
    }
    console.log('Created 3 arenas.');
  }
  const tatamis = await prisma.tatami.findMany({ where: { eventId: event.id }, orderBy: { order: 'asc' } });

  // Admin
  const adminUsername = process.env.ADMIN_USERNAME ?? 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123';
  const existingAdmin = await prisma.user.findUnique({ where: { username: adminUsername } });
  if (!existingAdmin) {
    await prisma.user.create({
      data: { username: adminUsername, passwordHash: await bcrypt.hash(adminPassword, 10), role: 'admin', displayName: 'Administrator' },
    });
    console.log('\n=========================================');
    console.log('  Admin account created');
    console.log(`  username: ${adminUsername}`);
    console.log(`  password: ${adminPassword}`);
    console.log('=========================================\n');
  } else {
    console.log(`Admin "${adminUsername}" already exists (password unchanged).`);
  }

  if (demo) {
    // Per-tatami editor accounts for RBAC testing.
    for (let i = 0; i < tatamis.length; i++) {
      const username = `tatami${i + 1}`;
      const exists = await prisma.user.findUnique({ where: { username } });
      if (!exists) {
        await prisma.user.create({
          data: {
            username,
            passwordHash: await bcrypt.hash('tatami123', 10),
            role: 'tatami_editor',
            displayName: `Editor ${tatamis[i].name}`,
            tatamis: { create: [{ tatamiId: tatamis[i].id }] },
          },
        });
      }
    }
    console.log('Demo editor accounts: tatami1 / tatami2 / tatami3 (password: tatami123)');

    // 200 synthetic fighters.
    const already = await prisma.fighter.count({ where: { eventId: event.id } });
    if (already < 200) {
      const ranks = await prisma.rank.findMany({ where: { eventId: event.id } });
      const data = Array.from({ length: 200 }, () => {
        const gender = Math.random() < 0.5 ? 'M' : 'F';
        return {
          eventId: event.id,
          firstName: rand(FIRST_NAMES),
          lastName: rand(LAST_NAMES),
          school: rand(SCHOOLS),
          teacherName: `Sensei ${rand(LAST_NAMES)}`,
          rankId: rand(ranks).id,
          age: randInt(7, 40),
          weight: randInt(20, 95),
          gender,
          city: rand(CITIES),
          country: 'UA',
        };
      });
      for (let i = 0; i < data.length; i += 100) await prisma.fighter.createMany({ data: data.slice(i, i + 100) });
      console.log('Seeded 200 demo fighters.');
    }
  }

  console.log('Seed complete.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
