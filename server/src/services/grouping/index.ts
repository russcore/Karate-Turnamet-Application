import { prisma } from '../../db.js';
import { DEFAULT_AI_SETTINGS, type AiSettings } from '../../types.js';
import { writeAudit } from '../audit.js';
import { proposeLocal } from './local.js';
import { proposeWithLLM } from './llm.js';
import type { FighterForGrouping, GroupingResult, ProposedGroup } from './types.js';

export type { ProposedGroup, GroupingResult, FighterForGrouping };

export async function getAiSettings(): Promise<AiSettings> {
  const row = await prisma.appSetting.findUnique({ where: { key: 'ai' } });
  if (!row) return { ...DEFAULT_AI_SETTINGS };
  try {
    return { ...DEFAULT_AI_SETTINGS, ...JSON.parse(row.value) };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export async function setAiSettings(patch: Partial<AiSettings>): Promise<AiSettings> {
  const current = await getAiSettings();
  const next = { ...current, ...patch };
  await prisma.appSetting.upsert({
    where: { key: 'ai' },
    create: { key: 'ai', value: JSON.stringify(next) },
    update: { value: JSON.stringify(next) },
  });
  return next;
}

async function loadFighters(eventId: number): Promise<FighterForGrouping[]> {
  const fighters = await prisma.fighter.findMany({
    where: { eventId },
    include: { rank: { select: { name: true, order: true } } },
  });
  return fighters.map((f) => ({
    id: f.id,
    firstName: f.firstName,
    lastName: f.lastName,
    gender: f.gender,
    age: f.age,
    weight: f.weight,
    rankId: f.rankId,
    rankName: f.rank.name,
    rankOrder: f.rank.order,
    school: f.school,
  }));
}

/** Build proposed groups using the configured provider, falling back to local on error. */
export async function proposeGroups(eventId: number): Promise<GroupingResult> {
  const settings = await getAiSettings();
  const fighters = await loadFighters(eventId);
  if (fighters.length === 0) return { provider: settings.provider, groups: [], warnings: ['No fighters imported yet.'], usedFallback: false };

  if (settings.provider === 'local') {
    const { groups, leftover } = proposeLocal(fighters, settings);
    return { provider: 'local', groups, warnings: [], usedFallback: false, ungrouped: leftover.length };
  }

  try {
    const { groups, warnings } = await proposeWithLLM(fighters, settings);
    return { provider: settings.provider, groups, warnings, usedFallback: false };
  } catch (err) {
    const { groups, leftover } = proposeLocal(fighters, settings);
    return {
      provider: settings.provider,
      groups,
      warnings: [`${settings.provider} failed (${(err as Error).message}); used the local engine instead.`],
      usedFallback: true,
      ungrouped: leftover.length,
    };
  }
}

/** Persist proposed groups as Category rows (+ entries + allowed ranks). Replaces existing categories by default. */
export async function applyGroups(
  eventId: number,
  groups: ProposedGroup[],
  opts: { replace?: boolean; userId?: number; assignTatamis?: boolean } = {},
): Promise<number> {
  return prisma.$transaction(async (tx) => {
    if (opts.replace) {
      await tx.category.deleteMany({ where: { eventId } });
    }
    const baseOrder = opts.replace ? 0 : await tx.category.count({ where: { eventId } });
    // Youngest first so kids' bouts run first and the oldest run last.
    const sorted = [...groups].sort((a, b) => a.ageMin - b.ageMin || (a.gender ?? '').localeCompare(b.gender ?? '') || a.weightMin - b.weightMin);
    // Round-robin across enabled tatamis so each mat gets a balanced youngest→oldest queue.
    const tatamis = opts.assignTatamis === false ? [] : await tx.tatami.findMany({ where: { eventId, enabled: true }, orderBy: { order: 'asc' } });
    let i = 0;
    for (const g of sorted) {
      const cat = await tx.category.create({
        data: {
          eventId,
          name: g.name,
          discipline: g.discipline,
          gender: g.gender,
          ageMin: g.ageMin,
          ageMax: g.ageMax,
          weightMin: g.weightMin,
          weightMax: g.weightMax,
          tatamiId: tatamis.length ? tatamis[i % tatamis.length].id : null,
          order: baseOrder + i++,
          status: 'pending',
        },
      });
      for (const rankId of g.rankIds) {
        await tx.categoryAllowedRank.create({ data: { categoryId: cat.id, rankId } });
      }
      let seed = 1;
      for (const fighterId of g.fighterIds) {
        await tx.categoryEntry.create({ data: { categoryId: cat.id, fighterId, seed: seed++ } });
      }
    }
    await writeAudit(
      { userId: opts.userId, entity: 'category', entityId: String(eventId), action: 'auto_group', after: { count: groups.length } },
      tx,
    );
    return groups.length;
  });
}
