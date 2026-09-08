type T = (key: string, vars?: Record<string, string | number>) => string;

/** Turn a stored slot source into friendly, localized text — never says "Loser". */
export function displaySlotLabel(label: string | null | undefined, t: T): string | null {
  if (!label) return null;
  if (label.startsWith('Winner ')) return `${t('slot.winner')} ${label.slice(7)}`;
  if (label.startsWith('From ')) return `${t('slot.from')} ${label.slice(5)}`;
  if (label.startsWith('Loser ')) return `${t('slot.from')} ${label.slice(6)}`; // legacy brackets
  return label;
}
