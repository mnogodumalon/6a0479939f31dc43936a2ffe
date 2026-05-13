import type { EnrichedZuordnungen } from '@/types/enriched';
import type { Aktivitaeten, Stammdaten, Zuordnungen } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function resolveDisplay(url: unknown, map: Map<string, any>, ...fields: string[]): string {
  if (!url) return '';
  const id = extractRecordId(url);
  if (!id) return '';
  const r = map.get(id);
  if (!r) return '';
  return fields.map(f => String(r.fields[f] ?? '')).join(' ').trim();
}

interface ZuordnungenMaps {
  stammdatenMap: Map<string, Stammdaten>;
  aktivitaetenMap: Map<string, Aktivitaeten>;
}

export function enrichZuordnungen(
  zuordnungen: Zuordnungen[],
  maps: ZuordnungenMaps
): EnrichedZuordnungen[] {
  return zuordnungen.map(r => ({
    ...r,
    personName: resolveDisplay(r.fields.person, maps.stammdatenMap, 'vorname', 'nachname'),
    aktivitaetName: resolveDisplay(r.fields.aktivitaet, maps.aktivitaetenMap, 'titel'),
  }));
}
