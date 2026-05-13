import type { Zuordnungen } from './app';

export type EnrichedZuordnungen = Zuordnungen & {
  personName: string;
  aktivitaetName: string;
};
