import { useState, useMemo, useCallback, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Stammdaten, Aktivitaeten, Zuordnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { StammdatenDialog } from '@/components/dialogs/StammdatenDialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  IconUsers,
  IconCalendar,
  IconMapPin,
  IconCheck,
  IconPlus,
  IconSearch,
  IconArrowLeft,
  IconUserCheck,
  IconAlertCircle,
} from '@tabler/icons-react';

const WIZARD_STEPS = [
  { label: 'Aktivität wählen' },
  { label: 'Teilnehmer zuordnen' },
  { label: 'Zusammenfassung' },
];

function formatDateTime(value: string | undefined): string {
  if (!value) return '–';
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return format(d, "dd. MMM yyyy, HH:mm 'Uhr'", { locale: de });
  } catch {
    return value;
  }
}

function formatDate(value: string): string {
  try {
    const d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return format(d, 'dd. MMM yyyy', { locale: de });
  } catch {
    return value;
  }
}

function getPersonName(p: Stammdaten): string {
  const parts = [p.fields.vorname, p.fields.nachname].filter(Boolean);
  return parts.length > 0 ? parts.join(' ') : '(Unbekannt)';
}

function getPersonSubtitle(p: Stammdaten): string {
  const parts: string[] = [];
  if (p.fields.email) parts.push(p.fields.email);
  if (p.fields.kategorie?.label) parts.push(p.fields.kategorie.label);
  return parts.join(' · ');
}

// Inline capacity tracker (BudgetTracker uses currency formatting, not suitable here)
function KapazitaetTracker({
  kapazitaet,
  belegt,
}: {
  kapazitaet: number | undefined;
  belegt: number;
}) {
  const max = kapazitaet ?? 0;
  const percent = max > 0 ? Math.min((belegt / max) * 100, 100) : 0;
  const overCapacity = max > 0 && belegt > max;
  const barColor = overCapacity
    ? 'bg-red-500'
    : percent >= 80
    ? 'bg-amber-500'
    : 'bg-primary';

  return (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-muted-foreground flex items-center gap-1.5">
          <IconUsers size={15} className="shrink-0" />
          Kapazität
        </span>
        <span className={`font-semibold ${overCapacity ? 'text-red-600' : ''}`}>
          {belegt}
          {max > 0 ? ` / ${max}` : ''}
          {' '}Teilnehmer
        </span>
      </div>
      {max > 0 && (
        <>
          <div className="h-2.5 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${barColor}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Belegt:{' '}
              <span className="font-semibold text-foreground">{belegt}</span>
            </span>
            <span>Gesamt: {max} Plätze</span>
          </div>
          {max - belegt > 0 && (
            <div className="flex items-center justify-between text-xs pt-1 border-t">
              <span className="text-muted-foreground">Noch verfügbar</span>
              <span className="font-semibold text-green-600">{max - belegt} Plätze</span>
            </div>
          )}
          {overCapacity && (
            <p className="text-xs text-red-600 font-medium flex items-center gap-1">
              <IconAlertCircle size={13} stroke={2} />
              Kapazität überschritten!
            </p>
          )}
        </>
      )}
    </div>
  );
}

export default function AktivitaetBesetzenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { stammdaten, aktivitaeten, zuordnungen, loading, error, fetchAll } = useDashboardData();

  // Derive initial step from URL
  const initialStep = useMemo(() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const initialAktivitaetId = searchParams.get('aktivitaetId') ?? null;

  const [currentStep, setCurrentStep] = useState<number>(initialStep);
  const [selectedAktivitaetId, setSelectedAktivitaetId] = useState<string | null>(
    initialAktivitaetId
  );
  const [selectedPersonIds, setSelectedPersonIds] = useState<Set<string>>(new Set());
  const [personSearch, setPersonSearch] = useState('');
  const [stammdatenDialogOpen, setStammdatenDialogOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newlyCreatedCount, setNewlyCreatedCount] = useState(0);
  const [lastCreatedNames, setLastCreatedNames] = useState<string[]>([]);

  // Sync step to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    if (currentStep > 1) {
      params.set('step', String(currentStep));
    } else {
      params.delete('step');
    }
    if (selectedAktivitaetId) {
      params.set('aktivitaetId', selectedAktivitaetId);
    } else {
      params.delete('aktivitaetId');
    }
    setSearchParams(params, { replace: true });
  }, [currentStep, selectedAktivitaetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select activity from URL param and jump to step 2
  useEffect(() => {
    if (initialAktivitaetId && !loading) {
      setSelectedAktivitaetId(initialAktivitaetId);
      if (initialStep === 1) {
        setCurrentStep(2);
      }
    }
  }, [loading]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedAktivitaet = useMemo<Aktivitaeten | null>(() => {
    if (!selectedAktivitaetId) return null;
    return aktivitaeten.find(a => a.record_id === selectedAktivitaetId) ?? null;
  }, [selectedAktivitaetId, aktivitaeten]);

  // Zuordnungen for the selected activity
  const existingZuordnungenForAktivitaet = useMemo<Zuordnungen[]>(() => {
    if (!selectedAktivitaetId) return [];
    return zuordnungen.filter(z => {
      const aktId = extractRecordId(z.fields.aktivitaet);
      return aktId === selectedAktivitaetId;
    });
  }, [selectedAktivitaetId, zuordnungen]);

  // Person IDs already assigned to this activity
  const alreadyAssignedPersonIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    existingZuordnungenForAktivitaet.forEach(z => {
      const pid = extractRecordId(z.fields.person);
      if (pid) ids.add(pid);
    });
    return ids;
  }, [existingZuordnungenForAktivitaet]);

  // Map person id -> Stammdaten for quick lookup
  const stammdatenMap = useMemo(() => {
    const m = new Map<string, Stammdaten>();
    stammdaten.forEach(s => m.set(s.record_id, s));
    return m;
  }, [stammdaten]);

  // Persons not yet assigned
  const availablePersonen = useMemo<Stammdaten[]>(() => {
    return stammdaten.filter(p => !alreadyAssignedPersonIds.has(p.record_id));
  }, [stammdaten, alreadyAssignedPersonIds]);

  // Filtered by search
  const filteredPersonen = useMemo<Stammdaten[]>(() => {
    if (!personSearch.trim()) return availablePersonen;
    const q = personSearch.toLowerCase();
    return availablePersonen.filter(p => {
      const name = getPersonName(p).toLowerCase();
      const email = (p.fields.email ?? '').toLowerCase();
      return name.includes(q) || email.includes(q);
    });
  }, [availablePersonen, personSearch]);

  // Already assigned persons with their Stammdaten records
  const assignedPersonen = useMemo<Stammdaten[]>(() => {
    const result: Stammdaten[] = [];
    alreadyAssignedPersonIds.forEach(id => {
      const p = stammdatenMap.get(id);
      if (p) result.push(p);
    });
    return result;
  }, [alreadyAssignedPersonIds, stammdatenMap]);

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  const handleSelectAktivitaet = useCallback((id: string) => {
    setSelectedAktivitaetId(id);
    setSelectedPersonIds(new Set());
    setPersonSearch('');
    setSubmitError(null);
    setCurrentStep(2);
  }, []);

  const togglePersonSelection = useCallback((personId: string) => {
    setSelectedPersonIds(prev => {
      const next = new Set(prev);
      if (next.has(personId)) {
        next.delete(personId);
      } else {
        next.add(personId);
      }
      return next;
    });
  }, []);

  const handleZuordnen = useCallback(async () => {
    if (!selectedAktivitaetId || selectedPersonIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);

    const today = format(new Date(), 'yyyy-MM-dd');
    const aktivitaetUrl = createRecordUrl(APP_IDS.AKTIVITAETEN, selectedAktivitaetId);
    const names: string[] = [];

    try {
      await Promise.all(
        Array.from(selectedPersonIds).map(async personId => {
          const personUrl = createRecordUrl(APP_IDS.STAMMDATEN, personId);
          await LivingAppsService.createZuordnungenEntry({
            person: personUrl,
            aktivitaet: aktivitaetUrl,
            zuordnungsdatum: today,
          });
          const p = stammdatenMap.get(personId);
          if (p) names.push(getPersonName(p));
        })
      );

      setNewlyCreatedCount(selectedPersonIds.size);
      setLastCreatedNames(names);
      await fetchAll();
      setSelectedPersonIds(new Set());
      setCurrentStep(3);
    } catch (err) {
      setSubmitError(
        err instanceof Error ? err.message : 'Fehler beim Erstellen der Zuordnungen.'
      );
    } finally {
      setSubmitting(false);
    }
  }, [selectedAktivitaetId, selectedPersonIds, stammdatenMap, fetchAll]);

  const handleReset = useCallback(() => {
    setSelectedAktivitaetId(null);
    setSelectedPersonIds(new Set());
    setPersonSearch('');
    setSubmitError(null);
    setNewlyCreatedCount(0);
    setLastCreatedNames([]);
    setCurrentStep(1);
  }, []);

  const handleWeitereZuordnungen = useCallback(() => {
    setSelectedPersonIds(new Set());
    setPersonSearch('');
    setSubmitError(null);
    setCurrentStep(2);
  }, []);

  const fetchPersonen = useCallback(async () => {
    await fetchAll();
  }, [fetchAll]);

  // All persons now assigned to activity (for summary)
  const allAssignedAfterSubmit = useMemo<Stammdaten[]>(() => {
    const result: Stammdaten[] = [];
    alreadyAssignedPersonIds.forEach(id => {
      const p = stammdatenMap.get(id);
      if (p) result.push(p);
    });
    return result;
  }, [alreadyAssignedPersonIds, stammdatenMap]);

  const totalBelegt = existingZuordnungenForAktivitaet.length + selectedPersonIds.size;

  return (
    <IntentWizardShell
      title="Aktivität besetzen"
      subtitle="Weise Personen aus den Stammdaten einer Aktivität zu"
      steps={WIZARD_STEPS}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── STEP 1: Aktivität auswählen ── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Welche Aktivität möchtest du besetzen?</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Wähle eine Aktivität aus der Liste. Du kannst anschließend Teilnehmer zuordnen.
            </p>
          </div>
          <EntitySelectStep
            items={aktivitaeten.map(a => {
              const assignedCount = zuordnungen.filter(z => {
                return extractRecordId(z.fields.aktivitaet) === a.record_id;
              }).length;
              const kap = a.fields.kapazitaet;
              const stats: { label: string; value: string | number }[] = [
                { label: 'Zugeordnet', value: assignedCount },
              ];
              if (kap != null && kap > 0) {
                stats.push({ label: 'Kapazität', value: kap });
              }
              if (a.fields.ort) {
                stats.push({ label: 'Ort', value: a.fields.ort });
              }
              return {
                id: a.record_id,
                title: a.fields.titel ?? '(Ohne Titel)',
                subtitle: a.fields.datum_uhrzeit
                  ? formatDateTime(a.fields.datum_uhrzeit)
                  : undefined,
                status: a.fields.aktivitaet_status
                  ? {
                      key: a.fields.aktivitaet_status.key,
                      label: a.fields.aktivitaet_status.label,
                    }
                  : undefined,
                stats,
                icon: <IconCalendar size={18} className="text-primary" stroke={1.5} />,
              };
            })}
            onSelect={handleSelectAktivitaet}
            searchPlaceholder="Aktivität suchen..."
            emptyText="Keine Aktivitäten gefunden."
            emptyIcon={<IconCalendar size={32} stroke={1.5} />}
          />
        </div>
      )}

      {/* ── STEP 2: Teilnehmer zuordnen ── */}
      {currentStep === 2 && selectedAktivitaet && (
        <div className="space-y-5">
          {/* Activity info card */}
          <div className="rounded-xl border bg-card p-4 space-y-2 overflow-hidden">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <IconCalendar size={18} className="text-primary" stroke={1.5} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base truncate">
                    {selectedAktivitaet.fields.titel ?? '(Ohne Titel)'}
                  </h3>
                  {selectedAktivitaet.fields.aktivitaet_status && (
                    <StatusBadge
                      statusKey={selectedAktivitaet.fields.aktivitaet_status.key}
                      label={selectedAktivitaet.fields.aktivitaet_status.label}
                    />
                  )}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                  {selectedAktivitaet.fields.datum_uhrzeit && (
                    <span className="flex items-center gap-1">
                      <IconCalendar size={12} stroke={2} />
                      {formatDateTime(selectedAktivitaet.fields.datum_uhrzeit)}
                    </span>
                  )}
                  {selectedAktivitaet.fields.ort && (
                    <span className="flex items-center gap-1">
                      <IconMapPin size={12} stroke={2} />
                      {selectedAktivitaet.fields.ort}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Capacity tracker */}
          <KapazitaetTracker
            kapazitaet={selectedAktivitaet.fields.kapazitaet}
            belegt={totalBelegt}
          />

          {/* Already assigned persons */}
          {assignedPersonen.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bereits zugeordnet ({assignedPersonen.length})
              </h4>
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {assignedPersonen.map(p => (
                  <div
                    key={p.record_id}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg bg-muted/50 border overflow-hidden"
                  >
                    <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <IconUserCheck size={14} className="text-primary" stroke={2} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{getPersonName(p)}</p>
                      {p.fields.email && (
                        <p className="text-xs text-muted-foreground truncate">{p.fields.email}</p>
                      )}
                    </div>
                    {p.fields.kategorie && (
                      <span className="text-xs text-muted-foreground shrink-0">
                        {p.fields.kategorie.label}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Person selection */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h4 className="text-sm font-semibold">
                Teilnehmer auswählen
                {selectedPersonIds.size > 0 && (
                  <span className="ml-2 text-primary">({selectedPersonIds.size} ausgewählt)</span>
                )}
              </h4>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setStammdatenDialogOpen(true)}
                className="shrink-0 gap-1.5"
              >
                <IconPlus size={14} stroke={2} />
                Neue Person anlegen
              </Button>
            </div>

            {/* Search */}
            <div className="relative">
              <IconSearch
                size={15}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                placeholder="Personen suchen..."
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* Person list */}
            {filteredPersonen.length === 0 ? (
              <div className="text-center py-10 text-muted-foreground">
                <IconUsers size={32} className="mx-auto mb-2 opacity-30" stroke={1.5} />
                <p className="text-sm">
                  {availablePersonen.length === 0
                    ? 'Alle Personen sind bereits zugeordnet.'
                    : 'Keine Personen gefunden.'}
                </p>
                {availablePersonen.length === 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setStammdatenDialogOpen(true)}
                    className="mt-3 gap-1.5"
                  >
                    <IconPlus size={14} stroke={2} />
                    Neue Person anlegen
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {filteredPersonen.map(p => {
                  const isSelected = selectedPersonIds.has(p.record_id);
                  return (
                    <button
                      key={p.record_id}
                      type="button"
                      onClick={() => togglePersonSelection(p.record_id)}
                      className={`w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl border transition-colors overflow-hidden ${
                        isSelected
                          ? 'bg-primary/5 border-primary/40 ring-1 ring-primary/20'
                          : 'bg-card border-border hover:bg-accent hover:border-primary/20'
                      }`}
                    >
                      {/* Checkbox indicator */}
                      <div
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors ${
                          isSelected
                            ? 'bg-primary border-primary'
                            : 'border-muted-foreground/40 bg-background'
                        }`}
                      >
                        {isSelected && <IconCheck size={12} stroke={3} className="text-primary-foreground" />}
                      </div>

                      {/* Avatar */}
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                        {(p.fields.vorname?.[0] ?? p.fields.nachname?.[0] ?? '?').toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getPersonName(p)}</p>
                        <p className="text-xs text-muted-foreground truncate">{getPersonSubtitle(p)}</p>
                      </div>

                      {p.fields.status && (
                        <StatusBadge
                          statusKey={p.fields.status.key}
                          label={p.fields.status.label}
                          className="shrink-0"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error */}
          {submitError && (
            <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
              <IconAlertCircle size={16} stroke={2} className="shrink-0" />
              {submitError}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-3 pt-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => {
                setSelectedPersonIds(new Set());
                setCurrentStep(1);
              }}
              className="gap-1.5"
            >
              <IconArrowLeft size={15} stroke={2} />
              Zurück
            </Button>
            <Button
              onClick={handleZuordnen}
              disabled={selectedPersonIds.size === 0 || submitting}
              className="gap-1.5 flex-1 sm:flex-none"
            >
              {submitting ? (
                'Wird zugeordnet...'
              ) : (
                <>
                  <IconUserCheck size={15} stroke={2} />
                  {selectedPersonIds.size > 0
                    ? `${selectedPersonIds.size} Person${selectedPersonIds.size !== 1 ? 'en' : ''} zuordnen`
                    : 'Personen auswählen'}
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* ── STEP 3: Zusammenfassung ── */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Success banner */}
          <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                <IconCheck size={20} stroke={2.5} className="text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-800">
                  {newlyCreatedCount} Zuordnung{newlyCreatedCount !== 1 ? 'en' : ''} erstellt!
                </h3>
                <p className="text-sm text-green-700 mt-0.5">
                  Die Teilnehmer wurden erfolgreich der Aktivität zugewiesen.
                </p>
              </div>
            </div>
            {lastCreatedNames.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {lastCreatedNames.map((name, i) => (
                  <span
                    key={i}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium"
                  >
                    <IconUserCheck size={11} stroke={2.5} />
                    {name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Activity summary */}
          {selectedAktivitaet && (
            <div className="rounded-xl border bg-card p-4 overflow-hidden">
              <h4 className="text-sm font-semibold mb-3">Aktivität</h4>
              <div className="flex items-start gap-3 min-w-0">
                <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                  <IconCalendar size={18} className="text-primary" stroke={1.5} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium truncate">
                    {selectedAktivitaet.fields.titel ?? '(Ohne Titel)'}
                  </p>
                  <div className="flex flex-wrap gap-x-4 mt-0.5 text-xs text-muted-foreground">
                    {selectedAktivitaet.fields.datum_uhrzeit && (
                      <span className="flex items-center gap-1">
                        <IconCalendar size={11} stroke={2} />
                        {formatDateTime(selectedAktivitaet.fields.datum_uhrzeit)}
                      </span>
                    )}
                    {selectedAktivitaet.fields.ort && (
                      <span className="flex items-center gap-1">
                        <IconMapPin size={11} stroke={2} />
                        {selectedAktivitaet.fields.ort}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* All assigned persons */}
          <div className="space-y-3">
            <h4 className="text-sm font-semibold">
              Alle zugeordneten Teilnehmer ({allAssignedAfterSubmit.length})
            </h4>
            {allAssignedAfterSubmit.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <IconUsers size={28} className="mx-auto mb-2 opacity-30" stroke={1.5} />
                <p className="text-sm">Noch keine Teilnehmer zugeordnet.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {allAssignedAfterSubmit.map(p => {
                  const zuordnung = existingZuordnungenForAktivitaet.find(
                    z => extractRecordId(z.fields.person) === p.record_id
                  );
                  return (
                    <div
                      key={p.record_id}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl border bg-card overflow-hidden"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-semibold text-primary">
                        {(p.fields.vorname?.[0] ?? p.fields.nachname?.[0] ?? '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{getPersonName(p)}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {[
                            p.fields.email,
                            p.fields.kategorie?.label,
                            zuordnung?.fields.zuordnungsdatum
                              ? `Zugeordnet am ${formatDate(zuordnung.fields.zuordnungsdatum)}`
                              : undefined,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>
                      {p.fields.status && (
                        <StatusBadge
                          statusKey={p.fields.status.key}
                          label={p.fields.status.label}
                          className="shrink-0"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            <Button
              variant="outline"
              onClick={handleWeitereZuordnungen}
              className="gap-1.5 flex-1"
            >
              <IconPlus size={15} stroke={2} />
              Weitere Zuordnungen
            </Button>
            <Button onClick={handleReset} className="gap-1.5 flex-1">
              <IconCalendar size={15} stroke={2} />
              Neue Aktivität besetzen
            </Button>
          </div>
        </div>
      )}

      {/* StammdatenDialog */}
      <StammdatenDialog
        open={stammdatenDialogOpen}
        onClose={() => setStammdatenDialogOpen(false)}
        onSubmit={async (fields: Stammdaten['fields']) => {
          await LivingAppsService.createStammdatenEntry(fields);
          await fetchPersonen();
        }}
        defaultValues={undefined}
        enablePhotoScan={AI_PHOTO_SCAN['Stammdaten']}
        enablePhotoLocation={AI_PHOTO_LOCATION['Stammdaten']}
      />
    </IntentWizardShell>
  );
}
