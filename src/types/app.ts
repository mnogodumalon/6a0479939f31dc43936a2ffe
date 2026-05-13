// AUTOMATICALLY GENERATED TYPES - DO NOT EDIT

export type LookupValue = { key: string; label: string };
export type GeoLocation = { lat: number; long: number; info?: string };

export interface Stammdaten {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    nachname?: string;
    email?: string;
    telefon?: string;
    kategorie?: LookupValue;
    status?: LookupValue;
    notizen?: string;
    vorname?: string;
  };
}

export interface Aktivitaeten {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    titel?: string;
    beschreibung?: string;
    datum_uhrzeit?: string; // Format: YYYY-MM-DD oder ISO String
    ort?: string;
    kapazitaet?: number;
    aktivitaet_status?: LookupValue;
  };
}

export interface Zuordnungen {
  record_id: string;
  createdat: string;
  updatedat: string | null;
  fields: {
    person?: string; // applookup -> URL zu 'Stammdaten' Record
    aktivitaet?: string; // applookup -> URL zu 'Aktivitaeten' Record
    zuordnungsdatum?: string; // Format: YYYY-MM-DD oder ISO String
    rolle?: LookupValue;
    bemerkungen?: string;
  };
}

export const APP_IDS = {
  STAMMDATEN: '6a0479785996561e7eb888d3',
  AKTIVITAETEN: '6a04797b355dad88d5f128f8',
  ZUORDNUNGEN: '6a04797cb57abfb8285398e8',
} as const;


export const LOOKUP_OPTIONS: Record<string, Record<string, {key: string, label: string}[]>> = {
  'stammdaten': {
    kategorie: [{ key: "mitarbeiter", label: "Mitarbeiter" }, { key: "kunde", label: "Kunde" }, { key: "partner", label: "Partner" }, { key: "lieferant", label: "Lieferant" }],
    status: [{ key: "aktiv", label: "Aktiv" }, { key: "inaktiv", label: "Inaktiv" }],
  },
  'aktivitaeten': {
    aktivitaet_status: [{ key: "geplant", label: "Geplant" }, { key: "bestaetigt", label: "Bestätigt" }, { key: "laufend", label: "Laufend" }, { key: "abgeschlossen", label: "Abgeschlossen" }, { key: "abgesagt", label: "Abgesagt" }],
  },
  'zuordnungen': {
    rolle: [{ key: "organisator", label: "Organisator" }, { key: "referent", label: "Referent" }, { key: "moderator", label: "Moderator" }, { key: "gast", label: "Gast" }, { key: "teilnehmer", label: "Teilnehmer" }],
  },
};

export const FIELD_TYPES: Record<string, Record<string, string>> = {
  'stammdaten': {
    'nachname': 'string/text',
    'email': 'string/email',
    'telefon': 'string/tel',
    'kategorie': 'lookup/select',
    'status': 'lookup/radio',
    'notizen': 'string/textarea',
    'vorname': 'string/text',
  },
  'aktivitaeten': {
    'titel': 'string/text',
    'beschreibung': 'string/textarea',
    'datum_uhrzeit': 'date/datetimeminute',
    'ort': 'string/text',
    'kapazitaet': 'number',
    'aktivitaet_status': 'lookup/select',
  },
  'zuordnungen': {
    'person': 'applookup/select',
    'aktivitaet': 'applookup/select',
    'zuordnungsdatum': 'date/date',
    'rolle': 'lookup/select',
    'bemerkungen': 'string/textarea',
  },
};

type StripLookup<T> = {
  [K in keyof T]: T[K] extends LookupValue | undefined ? string | LookupValue | undefined
    : T[K] extends LookupValue[] | undefined ? string[] | LookupValue[] | undefined
    : T[K];
};

// Helper Types for creating new records (lookup fields as plain strings for API)
export type CreateStammdaten = StripLookup<Stammdaten['fields']>;
export type CreateAktivitaeten = StripLookup<Aktivitaeten['fields']>;
export type CreateZuordnungen = StripLookup<Zuordnungen['fields']>;