import { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { de } from 'date-fns/locale';
import { IntentWizardShell } from '@/components/IntentWizardShell';
import { EntitySelectStep } from '@/components/EntitySelectStep';
import { StatusBadge } from '@/components/StatusBadge';
import { useDashboardData } from '@/hooks/useDashboardData';
import type { Stammdaten, Aktivitaeten, Zuordnungen } from '@/types/app';
import { APP_IDS } from '@/types/app';
import { AI_PHOTO_SCAN, AI_PHOTO_LOCATION } from '@/config/ai-features';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { AktivitaetenDialog } from '@/components/dialogs/AktivitaetenDialog';
import { StammdatenDialog } from '@/components/dialogs/StammdatenDialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  IconUserPlus,
  IconCalendarPlus,
  IconCheck,
  IconArrowLeft,
  IconPlus,
  IconCalendar,
  IconMapPin,
  IconUsers,
  IconRefresh,
} from '@tabler/icons-react';

const STEPS = [
  { label: 'Person auswählen' },
  { label: 'Aktivitäten auswählen' },
  { label: 'Zusammenfassung' },
];

function formatDateTime(raw: string | undefined): string {
  if (!raw) return '—';
  try {
    const d = new Date(raw);
    return format(d, 'dd.MM.yyyy HH:mm', { locale: de });
  } catch {
    return raw;
  }
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

export default function PersonEinplanenPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { stammdaten, aktivitaeten, zuordnungen, loading, error, fetchAll } = useDashboardData();

  // Step state — initialise from URL param (1-indexed in URL, 1-indexed internally)
  const initialStep = (() => {
    const s = parseInt(searchParams.get('step') ?? '', 10);
    return s >= 1 && s <= 3 ? s : 1;
  })();
  const [currentStep, setCurrentStep] = useState(initialStep);

  // Selection state
  const initialPersonId = searchParams.get('personId') ?? null;
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(initialPersonId);
  const [selectedAktivitaetenIds, setSelectedAktivitaetenIds] = useState<Set<string>>(new Set());

  // Dialog state
  const [stammdatenDialogOpen, setStammdatenDialogOpen] = useState(false);
  const [aktivitaetenDialogOpen, setAktivitaetenDialogOpen] = useState(false);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [newlyCreatedCount, setNewlyCreatedCount] = useState(0);

  // Sync step changes back to URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('step', String(currentStep));
    if (selectedPersonId) {
      params.set('personId', selectedPersonId);
    } else {
      params.delete('personId');
    }
    setSearchParams(params, { replace: true });
  }, [currentStep, selectedPersonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // If personId is in URL and step > 1, keep the selection
  useEffect(() => {
    if (initialPersonId && initialStep > 1) {
      setSelectedPersonId(initialPersonId);
      setCurrentStep(initialStep);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleStepChange = useCallback((step: number) => {
    setCurrentStep(step);
  }, []);

  // Derived: selected person record
  const selectedPerson = useMemo<Stammdaten | null>(() => {
    if (!selectedPersonId) return null;
    return stammdaten.find(p => p.record_id === selectedPersonId) ?? null;
  }, [selectedPersonId, stammdaten]);

  // Derived: existing Zuordnungen for selected person
  const personZuordnungen = useMemo<Zuordnungen[]>(() => {
    if (!selectedPersonId) return [];
    return zuordnungen.filter(z => {
      const pid = extractRecordId(z.fields.person);
      return pid === selectedPersonId;
    });
  }, [selectedPersonId, zuordnungen]);

  // Derived: set of Aktivitaeten IDs already assigned to this person
  const assignedAktivitaetenIds = useMemo<Set<string>>(() => {
    const ids = new Set<string>();
    personZuordnungen.forEach(z => {
      const aid = extractRecordId(z.fields.aktivitaet);
      if (aid) ids.add(aid);
    });
    return ids;
  }, [personZuordnungen]);

  // Derived: available Aktivitaeten (not yet assigned to person)
  const availableAktivitaeten = useMemo<Aktivitaeten[]>(() => {
    return aktivitaeten.filter(a => !assignedAktivitaetenIds.has(a.record_id));
  }, [aktivitaeten, assignedAktivitaetenIds]);

  // Derived: count of existing Zuordnungen per Aktivität
  const zuordnungenPerAktivitaet = useMemo<Map<string, number>>(() => {
    const m = new Map<string, number>();
    zuordnungen.forEach(z => {
      const aid = extractRecordId(z.fields.aktivitaet);
      if (aid) m.set(aid, (m.get(aid) ?? 0) + 1);
    });
    return m;
  }, [zuordnungen]);

  // Step 1: Handle person selection
  function handlePersonSelect(personId: string) {
    setSelectedPersonId(personId);
    setSelectedAktivitaetenIds(new Set());
    setSubmitError(null);
    setCurrentStep(2);
  }

  // Step 2: Toggle activity selection
  function toggleAktivitaet(id: string) {
    setSelectedAktivitaetenIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Step 2: Submit — create Zuordnung records
  async function handleEinplanen() {
    if (!selectedPersonId || selectedAktivitaetenIds.size === 0) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const personUrl = createRecordUrl(APP_IDS.STAMMDATEN, selectedPersonId);
      const today = todayIso();
      await Promise.all(
        Array.from(selectedAktivitaetenIds).map(aid => {
          const aktivitaetUrl = createRecordUrl(APP_IDS.AKTIVITAETEN, aid);
          return LivingAppsService.createZuordnungenEntry({
            person: personUrl,
            aktivitaet: aktivitaetUrl,
            zuordnungsdatum: today,
          });
        })
      );
      setNewlyCreatedCount(selectedAktivitaetenIds.size);
      await fetchAll();
      setCurrentStep(3);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Fehler beim Einplanen');
    } finally {
      setSubmitting(false);
    }
  }

  function handleReset() {
    setSelectedPersonId(null);
    setSelectedAktivitaetenIds(new Set());
    setSubmitError(null);
    setNewlyCreatedCount(0);
    setCurrentStep(1);
  }

  function handleBackToStep2() {
    setSelectedAktivitaetenIds(new Set());
    setSubmitError(null);
    setCurrentStep(2);
  }

  // Person items for EntitySelectStep
  const personItems = useMemo(() => stammdaten.map(p => ({
    id: p.record_id,
    title: [p.fields.vorname, p.fields.nachname].filter(Boolean).join(' ') || p.record_id,
    subtitle: p.fields.email,
    status: p.fields.status,
    stats: p.fields.kategorie ? [{ label: 'Kategorie', value: p.fields.kategorie.label }] : undefined,
    icon: <IconUserPlus size={18} className="text-primary" />,
  })), [stammdaten]);

  const fullPersonName = selectedPerson
    ? [selectedPerson.fields.vorname, selectedPerson.fields.nachname].filter(Boolean).join(' ')
    : '';

  return (
    <IntentWizardShell
      title="Person einplanen"
      subtitle="Wähle eine Person aus und weise ihr Aktivitäten zu"
      steps={STEPS}
      currentStep={currentStep}
      onStepChange={handleStepChange}
      loading={loading}
      error={error}
      onRetry={fetchAll}
    >
      {/* ── STEP 1: Person auswählen ── */}
      {currentStep === 1 && (
        <div className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Person auswählen</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Suche die Person, die du einplanen möchtest, oder lege eine neue an.
            </p>
          </div>
          <EntitySelectStep
            items={personItems}
            onSelect={handlePersonSelect}
            searchPlaceholder="Person suchen..."
            emptyIcon={<IconUserPlus size={32} />}
            emptyText="Keine Personen gefunden."
            createLabel="Neue Person anlegen"
            onCreateNew={() => setStammdatenDialogOpen(true)}
            createDialog={
              <StammdatenDialog
                open={stammdatenDialogOpen}
                onClose={() => setStammdatenDialogOpen(false)}
                onSubmit={async (fields) => {
                  const res = await LivingAppsService.createStammdatenEntry(fields);
                  await fetchAll();
                  // Auto-select newly created person
                  if (res && typeof res === 'object') {
                    const entries = Object.entries(res as Record<string, unknown>);
                    if (entries.length > 0) {
                      const newId = entries[0][0];
                      setStammdatenDialogOpen(false);
                      handlePersonSelect(newId);
                    }
                  }
                }}
                defaultValues={undefined}
                enablePhotoScan={AI_PHOTO_SCAN['Stammdaten']}
                enablePhotoLocation={AI_PHOTO_LOCATION['Stammdaten']}
              />
            }
          />
        </div>
      )}

      {/* ── STEP 2: Aktivitäten auswählen ── */}
      {currentStep === 2 && selectedPerson && (
        <div className="space-y-5">
          {/* Person info header */}
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-muted/30 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <IconUserPlus size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{fullPersonName}</span>
                <StatusBadge
                  statusKey={selectedPerson.fields.status?.key}
                  label={selectedPerson.fields.status?.label}
                />
              </div>
              {selectedPerson.fields.email && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">{selectedPerson.fields.email}</p>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0"
              onClick={() => setCurrentStep(1)}
            >
              <IconArrowLeft size={14} className="mr-1" />
              Ändern
            </Button>
          </div>

          {/* Existing assignments */}
          {personZuordnungen.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Bereits eingeplant ({personZuordnungen.length})
              </h3>
              <div className="space-y-2">
                {personZuordnungen.map(z => {
                  const aid = extractRecordId(z.fields.aktivitaet);
                  const akt = aid ? aktivitaeten.find(a => a.record_id === aid) : null;
                  return (
                    <div key={z.record_id} className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20 overflow-hidden">
                      <IconCheck size={16} className="text-green-600 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium truncate block">
                          {akt?.fields.titel ?? '—'}
                        </span>
                        {akt?.fields.datum_uhrzeit && (
                          <span className="text-xs text-muted-foreground">
                            {formatDateTime(akt.fields.datum_uhrzeit)}
                            {akt.fields.ort && ` · ${akt.fields.ort}`}
                          </span>
                        )}
                      </div>
                      {akt?.fields.aktivitaet_status && (
                        <StatusBadge
                          statusKey={akt.fields.aktivitaet_status.key}
                          label={akt.fields.aktivitaet_status.label}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available activities to assign */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Verfügbare Aktivitäten ({availableAktivitaeten.length})
              </h3>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAktivitaetenDialogOpen(true)}
              >
                <IconPlus size={14} className="mr-1" />
                Neue Aktivität
              </Button>
            </div>

            {availableAktivitaeten.length === 0 ? (
              <div className="text-center py-10 border rounded-xl bg-muted/10">
                <IconCalendarPlus size={32} className="mx-auto text-muted-foreground/40 mb-2" />
                <p className="text-sm text-muted-foreground">
                  Alle Aktivitäten sind dieser Person bereits zugeordnet.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => setAktivitaetenDialogOpen(true)}
                >
                  <IconPlus size={14} className="mr-1" />
                  Neue Aktivität anlegen
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                {availableAktivitaeten.map(akt => {
                  const isSelected = selectedAktivitaetenIds.has(akt.record_id);
                  const assignedCount = zuordnungenPerAktivitaet.get(akt.record_id) ?? 0;
                  const capacity = akt.fields.kapazitaet ?? null;
                  const remaining = capacity !== null ? capacity - assignedCount : null;
                  const isFull = remaining !== null && remaining <= 0;

                  return (
                    <button
                      key={akt.record_id}
                      onClick={() => !isFull && toggleAktivitaet(akt.record_id)}
                      disabled={isFull}
                      className={`w-full text-left flex items-start gap-3 p-4 rounded-xl border transition-colors overflow-hidden ${
                        isFull
                          ? 'opacity-50 cursor-not-allowed bg-muted/20'
                          : isSelected
                          ? 'bg-primary/5 border-primary/40'
                          : 'bg-card hover:bg-accent hover:border-primary/20'
                      }`}
                    >
                      <div className="pt-0.5 shrink-0">
                        <Checkbox
                          checked={isSelected}
                          disabled={isFull}
                          onCheckedChange={() => !isFull && toggleAktivitaet(akt.record_id)}
                          onClick={e => e.stopPropagation()}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">{akt.fields.titel ?? '—'}</span>
                          {akt.fields.aktivitaet_status && (
                            <StatusBadge
                              statusKey={akt.fields.aktivitaet_status.key}
                              label={akt.fields.aktivitaet_status.label}
                            />
                          )}
                          {isFull && (
                            <span className="text-xs text-red-600 font-medium">Ausgebucht</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {akt.fields.datum_uhrzeit && (
                            <span className="flex items-center gap-1">
                              <IconCalendar size={12} className="shrink-0" />
                              {formatDateTime(akt.fields.datum_uhrzeit)}
                            </span>
                          )}
                          {akt.fields.ort && (
                            <span className="flex items-center gap-1 truncate">
                              <IconMapPin size={12} className="shrink-0" />
                              <span className="truncate">{akt.fields.ort}</span>
                            </span>
                          )}
                          {capacity !== null && (
                            <span className="flex items-center gap-1">
                              <IconUsers size={12} className="shrink-0" />
                              {remaining !== null ? `${remaining} von ${capacity} Plätzen frei` : `${capacity} Plätze`}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Error message */}
          {submitError && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              {submitError}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex items-center justify-between gap-3 pt-2 flex-wrap">
            <Button
              variant="outline"
              onClick={() => setCurrentStep(1)}
            >
              <IconArrowLeft size={16} className="mr-1.5" />
              Zurück
            </Button>
            <Button
              onClick={handleEinplanen}
              disabled={selectedAktivitaetenIds.size === 0 || submitting}
            >
              {submitting ? (
                <>
                  <IconRefresh size={16} className="mr-1.5 animate-spin" />
                  Wird eingespeichert...
                </>
              ) : (
                <>
                  <IconCalendarPlus size={16} className="mr-1.5" />
                  {selectedAktivitaetenIds.size === 0
                    ? 'Einplanen'
                    : `${selectedAktivitaetenIds.size} Aktivität${selectedAktivitaetenIds.size !== 1 ? 'en' : ''} einplanen`}
                </>
              )}
            </Button>
          </div>

          {/* AktivitaetenDialog */}
          <AktivitaetenDialog
            open={aktivitaetenDialogOpen}
            onClose={() => setAktivitaetenDialogOpen(false)}
            onSubmit={async (fields) => {
              await LivingAppsService.createAktivitaetenEntry(fields);
              await fetchAll();
            }}
            defaultValues={undefined}
            enablePhotoScan={AI_PHOTO_SCAN['Aktivitaeten']}
            enablePhotoLocation={AI_PHOTO_LOCATION['Aktivitaeten']}
          />
        </div>
      )}

      {/* ── STEP 3: Zusammenfassung ── */}
      {currentStep === 3 && selectedPerson && (
        <div className="space-y-5">
          {/* Success banner */}
          <div className="flex items-start gap-4 p-5 rounded-xl border bg-green-50 border-green-200 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
              <IconCheck size={20} className="text-green-600" stroke={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-green-800">Erfolgreich eingeplant!</p>
              <p className="text-sm text-green-700 mt-0.5">
                {fullPersonName} wurde{' '}
                {newlyCreatedCount === 1
                  ? '1 Aktivität'
                  : `${newlyCreatedCount} Aktivitäten`}{' '}
                zugeordnet.
              </p>
            </div>
          </div>

          {/* Person header */}
          <div className="flex items-start gap-3 p-4 rounded-xl border bg-muted/30 overflow-hidden">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
              <IconUserPlus size={18} className="text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold truncate">{fullPersonName}</span>
                <StatusBadge
                  statusKey={selectedPerson.fields.status?.key}
                  label={selectedPerson.fields.status?.label}
                />
              </div>
              {selectedPerson.fields.email && (
                <p className="text-sm text-muted-foreground truncate mt-0.5">
                  {selectedPerson.fields.email}
                </p>
              )}
            </div>
          </div>

          {/* Full schedule for this person */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-2">
              Alle Aktivitäten dieser Person ({personZuordnungen.length})
            </h3>
            {personZuordnungen.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">
                Noch keine Aktivitäten zugeordnet.
              </p>
            ) : (
              <div className="space-y-2">
                {personZuordnungen.map(z => {
                  const aid = extractRecordId(z.fields.aktivitaet);
                  const akt = aid ? aktivitaeten.find(a => a.record_id === aid) : null;
                  return (
                    <div key={z.record_id} className="flex items-start gap-3 p-4 rounded-xl border bg-card overflow-hidden">
                      <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <IconCalendar size={15} className="text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-sm truncate">
                            {akt?.fields.titel ?? '—'}
                          </span>
                          {akt?.fields.aktivitaet_status && (
                            <StatusBadge
                              statusKey={akt.fields.aktivitaet_status.key}
                              label={akt.fields.aktivitaet_status.label}
                            />
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                          {akt?.fields.datum_uhrzeit && (
                            <span className="flex items-center gap-1">
                              <IconCalendar size={11} className="shrink-0" />
                              {formatDateTime(akt.fields.datum_uhrzeit)}
                            </span>
                          )}
                          {akt?.fields.ort && (
                            <span className="flex items-center gap-1 truncate">
                              <IconMapPin size={11} className="shrink-0" />
                              <span className="truncate">{akt.fields.ort}</span>
                            </span>
                          )}
                        </div>
                        {z.fields.zuordnungsdatum && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Zugeordnet am: {z.fields.zuordnungsdatum}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 flex-wrap pt-2">
            <Button variant="outline" onClick={handleBackToStep2}>
              <IconCalendarPlus size={16} className="mr-1.5" />
              Weitere Aktivitäten
            </Button>
            <Button onClick={handleReset}>
              <IconUserPlus size={16} className="mr-1.5" />
              Neue Person einplanen
            </Button>
          </div>
        </div>
      )}
    </IntentWizardShell>
  );
}
