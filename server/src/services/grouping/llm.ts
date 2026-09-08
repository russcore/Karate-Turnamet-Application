import type { AiSettings } from '../../types.js';
import type { FighterForGrouping, ProposedGroup } from './types.js';

const DEFAULT_MODELS: Record<string, string> = {
  claude: 'claude-3-5-sonnet-latest',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
};

function buildPrompt(fighters: FighterForGrouping[], s: AiSettings): string {
  const roster = fighters.map((f) => ({
    id: f.id,
    name: `${f.firstName} ${f.lastName}`,
    gender: f.gender,
    age: f.age,
    weight: f.weight,
    rank: f.rankName,
    school: f.school,
  }));
  return [
    'You are seeding a karate tournament. Split the fighters into competition groups (divisions).',
    'Hard rules:',
    `- Every group must contain between ${s.minGroupSize} and ${s.maxGroupSize} fighters.`,
    '- Never mix genders in one group.',
    `- Keep ages within ~${s.ageBand} years and weights within ~${s.weightBand} kg where possible.`,
    '- Group fighters of similar rank/experience together.',
    s.avoidSameSchool ? '- Prefer not to put fighters from the same school in the same small group.' : '',
    '',
    'Return ONLY JSON of the exact shape:',
    '{ "groups": [ { "name": "string", "fighterIds": [numbers] } ] }',
    'Every fighter id must appear in exactly one group.',
    '',
    `Fighters: ${JSON.stringify(roster)}`,
  ]
    .filter(Boolean)
    .join('\n');
}

async function callProvider(prompt: string, s: AiSettings): Promise<string> {
  const model = s.model || DEFAULT_MODELS[s.provider] || '';
  if (!s.apiKey) throw new Error('Missing API key for provider ' + s.provider);

  if (s.provider === 'claude') {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': s.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 4096, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!res.ok) throw new Error(`Claude API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.content?.[0]?.text ?? '';
  }

  if (s.provider === 'openai') {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${s.apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      }),
    });
    if (!res.ok) throw new Error(`OpenAI API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  }

  if (s.provider === 'gemini') {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.apiKey}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    });
    if (!res.ok) throw new Error(`Gemini API ${res.status}: ${await res.text()}`);
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
  }

  throw new Error('Unknown provider ' + s.provider);
}

function extractJson(text: string): any {
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(trimmed.slice(start, end + 1));
    throw new Error('LLM did not return valid JSON');
  }
}

/**
 * Ask the configured LLM to split fighters into groups, then enforce the hard
 * constraints ourselves (single gender, size <= max) by splitting where needed.
 * The caller falls back to the local engine if this throws.
 */
export async function proposeWithLLM(
  fighters: FighterForGrouping[],
  s: AiSettings,
): Promise<{ groups: ProposedGroup[]; warnings: string[] }> {
  const byId = new Map(fighters.map((f) => [f.id, f]));
  const raw = await callProvider(buildPrompt(fighters, s), s);
  const parsed = extractJson(raw);
  const warnings: string[] = [];
  const assigned = new Set<number>();
  const out: ProposedGroup[] = [];
  const maxSize = Math.min(8, s.maxGroupSize);

  for (const g of parsed.groups ?? []) {
    const members = (g.fighterIds ?? [])
      .map((id: number) => byId.get(id))
      .filter((f: FighterForGrouping | undefined): f is FighterForGrouping => !!f && !assigned.has(f.id));
    if (members.length === 0) continue;

    // Enforce single gender by splitting.
    const byGender = new Map<string, FighterForGrouping[]>();
    for (const m of members) (byGender.get(m.gender ?? 'X') ?? byGender.set(m.gender ?? 'X', []).get(m.gender ?? 'X')!).push(m);
    if (byGender.size > 1) warnings.push(`Group "${g.name}" mixed genders; split automatically.`);

    for (const [, gm] of byGender) {
      const sorted = [...gm].sort((a, b) => a.weight - b.weight);
      for (let i = 0; i < sorted.length; i += maxSize) {
        const chunk = sorted.slice(i, i + maxSize);
        chunk.forEach((m) => assigned.add(m.id));
        out.push(materialize(g.name, chunk));
      }
    }
  }

  // Any fighter the LLM forgot -> its own leftover group (never drop silently).
  const leftover = fighters.filter((f) => !assigned.has(f.id));
  if (leftover.length) {
    warnings.push(`${leftover.length} fighter(s) were not placed by the model; grouped as leftovers.`);
    const sorted = [...leftover].sort((a, b) => a.weight - b.weight);
    for (let i = 0; i < sorted.length; i += maxSize) out.push(materialize('Unassigned', sorted.slice(i, i + maxSize)));
  }

  return { groups: out, warnings };
}

function materialize(name: string, members: FighterForGrouping[]): ProposedGroup {
  const ages = members.map((m) => m.age);
  const weights = members.map((m) => m.weight);
  return {
    name: name || 'Group',
    discipline: 'kumite',
    gender: members[0]?.gender ?? null,
    ageMin: Math.min(...ages),
    ageMax: Math.max(...ages),
    weightMin: Math.min(...weights),
    weightMax: Math.max(...weights),
    rankIds: [...new Set(members.map((m) => m.rankId))],
    fighterIds: members.map((m) => m.id),
  };
}
