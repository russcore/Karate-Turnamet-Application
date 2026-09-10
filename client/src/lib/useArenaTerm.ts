import { useEvent } from './queries';
import { useI18n } from '../i18n';

/**
 * The admin-configurable label for an arena / tatami (free text set in Branding).
 * Falls back to the translated default ("Arena" / "Arena setup") when not set.
 */
export function useArenaTerm(): string {
  const { data: event } = useEvent();
  const { t } = useI18n();
  return event?.arenaTerm?.trim() || t('nav.tatami');
}
