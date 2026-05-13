import { useDashboardData } from '@/hooks/useDashboardData';
import { enrichZuordnungen } from '@/lib/enrich';
import type { EnrichedZuordnungen } from '@/types/enriched';
import type { Stammdaten, Aktivitaeten, Zuordnungen } from '@/types/app';
import { APP_IDS, LOOKUP_OPTIONS } from '@/types/app';
import { LivingAppsService, extractRecordId, createRecordUrl } from '@/services/livingAppsService';
import { formatDate } from '@/lib/formatters';
import { useState, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatCard } from '@/components/StatCard';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { AktivitaetenDialog } from '@/components/dialogs/AktivitaetenDialog';
import { StammdatenDialog } from '@/components/dialogs/StammdatenDialog';
import { ZuordnungenDialog } from '@/components/dialogs/ZuordnungenDialog';
import { AI_PHOTO_SCAN } from '@/config/ai-features';
import {
  IconAlertCircle, IconTool, IconRefresh, IconCheck,
  IconPlus, IconPencil, IconTrash, IconUsers, IconCalendar,
  IconMapPin, IconChevronRight, IconUserPlus, IconActivity,
  IconSearch, IconX,
} from '@tabler/icons-react';

const APPGROUP_ID = '6a0479939f31dc43936a2ffe';
const REPAIR_ENDPOINT = '/claude/build/repair';

// Status badge colors
function AktivitaetStatusBadge({ status }: { status?: { key: string; label: string } }) {
  if (!status) return <Badge variant="secondary">—</Badge>;
  const colorMap: Record<string, string> = {
    geplant: 'bg-blue-100 text-blue-700 border-blue-200',
    bestaetigt: 'bg-indigo-100 text-indigo-700 border-indigo-200',
    laufend: 'bg-amber-100 text-amber-700 border-amber-200',
    abgeschlossen: 'bg-green-100 text-green-700 border-green-200',
    abgesagt: 'bg-red-100 text-red-700 border-red-200',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${colorMap[status.key] ?? 'bg-muted text-muted-foreground'}`}>
      {status.label}
    </span>
  );
}

function KategorieBadge({ kategorie }: { kategorie?: { key: string; label: string } }) {
  if (!kategorie) return null;
  const colorMap: Record<string, string> = {
    mitarbeiter: 'bg-violet-100 text-violet-700',
    kunde: 'bg-cyan-100 text-cyan-700',
    partner: 'bg-orange-100 text-orange-700',
    lieferant: 'bg-teal-100 text-teal-700',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${colorMap[kategorie.key] ?? 'bg-muted text-muted-foreground'}`}>
      {kategorie.label}
    </span>
  );
}

export default function DashboardOverview() {
  const {
    stammdaten, aktivitaeten, zuordnungen,
    stammdatenMap, aktivitaetenMap,
    loading, error, fetchAll,
  } = useDashboardData();

  const enrichedZuordnungen = enrichZuordnungen(zuordnungen, { stammdatenMap, aktivitaetenMap });

  // State — ALL hooks before early returns
  const [selectedAktivitaet, setSelectedAktivitaet] = useState<Aktivitaeten | null>(null);
  const [aktivitaetDialogOpen, setAktivitaetDialogOpen] = useState(false);
  const [editAktivitaet, setEditAktivitaet] = useState<Aktivitaeten | null>(null);
  const [deleteAktivitaetTarget, setDeleteAktivitaetTarget] = useState<Aktivitaeten | null>(null);

  const [stammdatenDialogOpen, setStammdatenDialogOpen] = useState(false);
  const [editStammdaten, setEditStammdaten] = useState<Stammdaten | null>(null);
  const [deleteStammdatenTarget, setDeleteStammdatenTarget] = useState<Stammdaten | null>(null);

  const [zuordnungDialogOpen, setZuordnungDialogOpen] = useState(false);
  const [editZuordnung, setEditZuordnung] = useState<Zuordnungen | null>(null);
  const [deleteZuordnungTarget, setDeleteZuordnungTarget] = useState<EnrichedZuordnungen | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('alle');

  // Computed data
  const filteredAktivitaeten = useMemo(() => {
    return aktivitaeten.filter(a => {
      const matchSearch = !searchQuery ||
        a.fields.titel?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        a.fields.ort?.toLowerCase().includes(searchQuery.toLowerCase());
      const matchStatus = filterStatus === 'alle' || a.fields.aktivitaet_status?.key === filterStatus;
      return matchSearch && matchStatus;
    });
  }, [aktivitaeten, searchQuery, filterStatus]);

  const aktivitaetZuordnungen = useMemo(() => {
    if (!selectedAktivitaet) return [];
    return enrichedZuordnungen.filter(z => {
      const id = extractRecordId(z.fields.aktivitaet);
      return id === selectedAktivitaet.record_id;
    });
  }, [selectedAktivitaet, enrichedZuordnungen]);

  const statsData = useMemo(() => {
    const aktiv = stammdaten.filter(s => s.fields.status?.key === 'aktiv').length;
    const laufend = aktivitaeten.filter(a => a.fields.aktivitaet_status?.key === 'laufend').length;
    const geplant = aktivitaeten.filter(a => a.fields.aktivitaet_status?.key === 'geplant').length;
    return { aktiv, laufend, geplant, total: stammdaten.length };
  }, [stammdaten, aktivitaeten]);

  if (loading) return <DashboardSkeleton />;
  if (error) return <DashboardError error={error} onRetry={fetchAll} />;

  const handleCreateAktivitaet = async (fields: Aktivitaeten['fields']) => {
    await LivingAppsService.createAktivitaetenEntry(fields);
    fetchAll();
  };

  const handleUpdateAktivitaet = async (fields: Aktivitaeten['fields']) => {
    if (!editAktivitaet) return;
    await LivingAppsService.updateAktivitaetenEntry(editAktivitaet.record_id, fields);
    if (selectedAktivitaet?.record_id === editAktivitaet.record_id) {
      setSelectedAktivitaet({ ...editAktivitaet, fields: { ...editAktivitaet.fields, ...fields } });
    }
    fetchAll();
  };

  const handleDeleteAktivitaet = async () => {
    if (!deleteAktivitaetTarget) return;
    await LivingAppsService.deleteAktivitaetenEntry(deleteAktivitaetTarget.record_id);
    if (selectedAktivitaet?.record_id === deleteAktivitaetTarget.record_id) {
      setSelectedAktivitaet(null);
    }
    setDeleteAktivitaetTarget(null);
    fetchAll();
  };

  const handleCreateStammdaten = async (fields: Stammdaten['fields']) => {
    await LivingAppsService.createStammdatenEntry(fields);
    fetchAll();
  };

  const handleUpdateStammdaten = async (fields: Stammdaten['fields']) => {
    if (!editStammdaten) return;
    await LivingAppsService.updateStammdatenEntry(editStammdaten.record_id, fields);
    fetchAll();
  };

  const handleDeleteStammdaten = async () => {
    if (!deleteStammdatenTarget) return;
    await LivingAppsService.deleteStammdatenEntry(deleteStammdatenTarget.record_id);
    setDeleteStammdatenTarget(null);
    fetchAll();
  };

  const handleCreateZuordnung = async (fields: Zuordnungen['fields']) => {
    await LivingAppsService.createZuordnungenEntry(fields);
    fetchAll();
  };

  const handleUpdateZuordnung = async (fields: Zuordnungen['fields']) => {
    if (!editZuordnung) return;
    await LivingAppsService.updateZuordnungenEntry(editZuordnung.record_id, fields);
    fetchAll();
  };

  const handleDeleteZuordnung = async () => {
    if (!deleteZuordnungTarget) return;
    await LivingAppsService.deleteZuordnungenEntry(deleteZuordnungTarget.record_id);
    setDeleteZuordnungTarget(null);
    fetchAll();
  };

  return (
    <div className="space-y-6">
      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard
          title="Personen gesamt"
          value={String(statsData.total)}
          description="in Stammdaten"
          icon={<IconUsers size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Aktive Personen"
          value={String(statsData.aktiv)}
          description="Status: Aktiv"
          icon={<IconCheck size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Laufende Aktivitäten"
          value={String(statsData.laufend)}
          description="Aktuell aktiv"
          icon={<IconActivity size={18} className="text-muted-foreground" />}
        />
        <StatCard
          title="Geplante Aktivitäten"
          value={String(statsData.geplant)}
          description="In Vorbereitung"
          icon={<IconCalendar size={18} className="text-muted-foreground" />}
        />
      </div>

      {/* Main Content: Master-Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Left: Aktivitäten List (master) */}
        <div className="lg:col-span-3 flex flex-col gap-4">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-foreground">Aktivitäten</h2>
            <Button
              size="sm"
              onClick={() => { setEditAktivitaet(null); setAktivitaetDialogOpen(true); }}
            >
              <IconPlus size={16} className="mr-1 shrink-0" />
              <span className="hidden sm:inline">Neue Aktivität</span>
              <span className="sm:hidden">Neu</span>
            </Button>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2">
            <div className="relative flex-1 min-w-[150px]">
              <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Suchen..."
                className="w-full pl-8 pr-8 py-1.5 text-sm rounded-xl border bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <IconX size={14} />
                </button>
              )}
            </div>
            <div className="flex gap-1 flex-wrap">
              {['alle', ...LOOKUP_OPTIONS.aktivitaeten.aktivitaet_status.map(o => o.key)].map(key => {
                const label = key === 'alle' ? 'Alle' : LOOKUP_OPTIONS.aktivitaeten.aktivitaet_status.find(o => o.key === key)?.label ?? key;
                return (
                  <button
                    key={key}
                    onClick={() => setFilterStatus(key)}
                    className={`px-2.5 py-1 rounded-xl text-xs font-medium transition-colors ${filterStatus === key ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-accent'}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aktivitäten cards */}
          <div className="flex flex-col gap-2 overflow-y-auto max-h-[560px] pr-1">
            {filteredAktivitaeten.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
                <IconCalendar size={40} className="text-muted-foreground" stroke={1.5} />
                <div>
                  <p className="font-medium text-foreground">Keine Aktivitäten</p>
                  <p className="text-sm text-muted-foreground mt-1">Erstelle eine neue Aktivität.</p>
                </div>
              </div>
            ) : (
              filteredAktivitaeten.map(a => {
                const isSelected = selectedAktivitaet?.record_id === a.record_id;
                const teilnehmerCount = enrichedZuordnungen.filter(z => {
                  const id = extractRecordId(z.fields.aktivitaet);
                  return id === a.record_id;
                }).length;
                return (
                  <button
                    key={a.record_id}
                    onClick={() => setSelectedAktivitaet(isSelected ? null : a)}
                    className={`w-full text-left rounded-2xl border p-4 transition-all ${isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border bg-card hover:border-primary/40 hover:bg-accent/30'}`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-sm text-foreground truncate">{a.fields.titel ?? '(Kein Titel)'}</span>
                          <AktivitaetStatusBadge status={a.fields.aktivitaet_status} />
                        </div>
                        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                          {a.fields.datum_uhrzeit && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground">
                              <IconCalendar size={12} className="shrink-0" />
                              {formatDate(a.fields.datum_uhrzeit)}
                            </span>
                          )}
                          {a.fields.ort && (
                            <span className="flex items-center gap-1 text-xs text-muted-foreground truncate max-w-[120px]">
                              <IconMapPin size={12} className="shrink-0" />
                              <span className="truncate">{a.fields.ort}</span>
                            </span>
                          )}
                          <span className="flex items-center gap-1 text-xs text-muted-foreground">
                            <IconUsers size={12} className="shrink-0" />
                            {teilnehmerCount}{a.fields.kapazitaet ? `/${a.fields.kapazitaet}` : ''}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={e => { e.stopPropagation(); setEditAktivitaet(a); setAktivitaetDialogOpen(true); }}
                          className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <IconPencil size={14} />
                        </button>
                        <button
                          onClick={e => { e.stopPropagation(); setDeleteAktivitaetTarget(a); }}
                          className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <IconTrash size={14} />
                        </button>
                        <IconChevronRight size={14} className={`text-muted-foreground transition-transform ${isSelected ? 'rotate-90' : ''}`} />
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          {selectedAktivitaet ? (
            <>
              {/* Aktivität Detail */}
              <div className="rounded-2xl border bg-card p-5 space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-foreground leading-tight">{selectedAktivitaet.fields.titel ?? '(Kein Titel)'}</h3>
                    <div className="mt-1">
                      <AktivitaetStatusBadge status={selectedAktivitaet.fields.aktivitaet_status} />
                    </div>
                  </div>
                  <button
                    onClick={() => { setEditAktivitaet(selectedAktivitaet); setAktivitaetDialogOpen(true); }}
                    className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors shrink-0"
                  >
                    <IconPencil size={15} />
                  </button>
                </div>
                {selectedAktivitaet.fields.beschreibung && (
                  <p className="text-sm text-muted-foreground leading-relaxed">{selectedAktivitaet.fields.beschreibung}</p>
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedAktivitaet.fields.datum_uhrzeit && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Datum & Uhrzeit</p>
                      <p className="font-medium flex items-center gap-1">
                        <IconCalendar size={13} className="text-primary shrink-0" />
                        {formatDate(selectedAktivitaet.fields.datum_uhrzeit)}
                      </p>
                    </div>
                  )}
                  {selectedAktivitaet.fields.ort && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Ort</p>
                      <p className="font-medium flex items-center gap-1 min-w-0">
                        <IconMapPin size={13} className="text-primary shrink-0" />
                        <span className="truncate">{selectedAktivitaet.fields.ort}</span>
                      </p>
                    </div>
                  )}
                  {selectedAktivitaet.fields.kapazitaet != null && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-0.5">Kapazität</p>
                      <p className="font-medium flex items-center gap-1">
                        <IconUsers size={13} className="text-primary shrink-0" />
                        {aktivitaetZuordnungen.length}/{selectedAktivitaet.fields.kapazitaet}
                      </p>
                    </div>
                  )}
                </div>
                {/* Capacity bar */}
                {selectedAktivitaet.fields.kapazitaet != null && selectedAktivitaet.fields.kapazitaet > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1">
                      <span>Auslastung</span>
                      <span>{Math.round((aktivitaetZuordnungen.length / selectedAktivitaet.fields.kapazitaet) * 100)}%</span>
                    </div>
                    <div className="h-2 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-primary rounded-full transition-all"
                        style={{ width: `${Math.min(100, (aktivitaetZuordnungen.length / selectedAktivitaet.fields.kapazitaet) * 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Teilnehmer / Zuordnungen */}
              <div className="rounded-2xl border bg-card overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b">
                  <h4 className="font-semibold text-sm">Teilnehmer ({aktivitaetZuordnungen.length})</h4>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs"
                    onClick={() => {
                      setEditZuordnung(null);
                      setZuordnungDialogOpen(true);
                    }}
                  >
                    <IconUserPlus size={14} className="mr-1 shrink-0" />
                    Hinzufügen
                  </Button>
                </div>
                <div className="divide-y max-h-[300px] overflow-y-auto">
                  {aktivitaetZuordnungen.length === 0 ? (
                    <div className="py-8 text-center text-sm text-muted-foreground">
                      Noch keine Teilnehmer zugeordnet.
                    </div>
                  ) : (
                    aktivitaetZuordnungen.map(z => (
                      <div key={z.record_id} className="flex items-center gap-3 px-4 py-2.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                          {z.personName ? z.personName.charAt(0).toUpperCase() : '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{z.personName || '(Unbekannt)'}</p>
                          <p className="text-xs text-muted-foreground">{z.fields.rolle?.label ?? '—'}</p>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => { setEditZuordnung(z); setZuordnungDialogOpen(true); }}
                            className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                          >
                            <IconPencil size={13} />
                          </button>
                          <button
                            onClick={() => setDeleteZuordnungTarget(z)}
                            className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <IconTrash size={13} />
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </>
          ) : (
            /* Personen panel when no activity selected */
            <div className="rounded-2xl border bg-card overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b">
                <h4 className="font-semibold text-sm">Personen ({stammdaten.length})</h4>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs"
                  onClick={() => { setEditStammdaten(null); setStammdatenDialogOpen(true); }}
                >
                  <IconPlus size={14} className="mr-1 shrink-0" />
                  Neu
                </Button>
              </div>
              <div className="divide-y max-h-[500px] overflow-y-auto">
                {stammdaten.length === 0 ? (
                  <div className="py-8 text-center text-sm text-muted-foreground">Noch keine Personen erfasst.</div>
                ) : (
                  stammdaten.map(s => (
                    <div key={s.record_id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-bold shrink-0">
                        {s.fields.vorname ? s.fields.vorname.charAt(0).toUpperCase() : s.fields.nachname?.charAt(0).toUpperCase() ?? '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{[s.fields.vorname, s.fields.nachname].filter(Boolean).join(' ') || '(Kein Name)'}</p>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <KategorieBadge kategorie={s.fields.kategorie} />
                          {s.fields.status && (
                            <span className={`text-xs ${s.fields.status.key === 'aktiv' ? 'text-green-600' : 'text-muted-foreground'}`}>
                              {s.fields.status.label}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          onClick={() => { setEditStammdaten(s); setStammdatenDialogOpen(true); }}
                          className="p-1 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <IconPencil size={13} />
                        </button>
                        <button
                          onClick={() => setDeleteStammdatenTarget(s)}
                          className="p-1 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <IconTrash size={13} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="px-4 py-2 border-t bg-muted/30 text-xs text-muted-foreground text-center">
                Aktivität auswählen, um Teilnehmer zu sehen
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Dialogs */}
      <AktivitaetenDialog
        open={aktivitaetDialogOpen}
        onClose={() => { setAktivitaetDialogOpen(false); setEditAktivitaet(null); }}
        onSubmit={editAktivitaet ? handleUpdateAktivitaet : handleCreateAktivitaet}
        defaultValues={editAktivitaet?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Aktivitaeten']}
      />

      <StammdatenDialog
        open={stammdatenDialogOpen}
        onClose={() => { setStammdatenDialogOpen(false); setEditStammdaten(null); }}
        onSubmit={editStammdaten ? handleUpdateStammdaten : handleCreateStammdaten}
        defaultValues={editStammdaten?.fields}
        enablePhotoScan={AI_PHOTO_SCAN['Stammdaten']}
      />

      <ZuordnungenDialog
        open={zuordnungDialogOpen}
        onClose={() => { setZuordnungDialogOpen(false); setEditZuordnung(null); }}
        onSubmit={editZuordnung ? handleUpdateZuordnung : handleCreateZuordnung}
        defaultValues={editZuordnung
          ? {
              ...editZuordnung.fields,
              aktivitaet: selectedAktivitaet
                ? createRecordUrl(APP_IDS.AKTIVITAETEN, selectedAktivitaet.record_id)
                : editZuordnung.fields.aktivitaet,
            }
          : selectedAktivitaet
          ? { aktivitaet: createRecordUrl(APP_IDS.AKTIVITAETEN, selectedAktivitaet.record_id) }
          : undefined
        }
        stammdatenList={stammdaten}
        aktivitaetenList={aktivitaeten}
        enablePhotoScan={AI_PHOTO_SCAN['Zuordnungen']}
      />

      <ConfirmDialog
        open={!!deleteAktivitaetTarget}
        title="Aktivität löschen"
        description={`Möchtest du "${deleteAktivitaetTarget?.fields.titel ?? 'diese Aktivität'}" wirklich löschen?`}
        onConfirm={handleDeleteAktivitaet}
        onClose={() => setDeleteAktivitaetTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteStammdatenTarget}
        title="Person löschen"
        description={`Möchtest du "${[deleteStammdatenTarget?.fields.vorname, deleteStammdatenTarget?.fields.nachname].filter(Boolean).join(' ') || 'diese Person'}" wirklich löschen?`}
        onConfirm={handleDeleteStammdaten}
        onClose={() => setDeleteStammdatenTarget(null)}
      />

      <ConfirmDialog
        open={!!deleteZuordnungTarget}
        title="Zuordnung löschen"
        description={`Möchtest du die Zuordnung von "${deleteZuordnungTarget?.personName ?? 'dieser Person'}" wirklich löschen?`}
        onConfirm={handleDeleteZuordnung}
        onClose={() => setDeleteZuordnungTarget(null)}
      />
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 space-y-3">
          <Skeleton className="h-8 w-40" />
          <Skeleton className="h-10 w-full rounded-xl" />
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}
        </div>
        <div className="lg:col-span-2">
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      </div>
    </div>
  );
}

function DashboardError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const [repairing, setRepairing] = useState(false);
  const [repairStatus, setRepairStatus] = useState('');
  const [repairDone, setRepairDone] = useState(false);
  const [repairFailed, setRepairFailed] = useState(false);

  const handleRepair = async () => {
    setRepairing(true);
    setRepairStatus('Reparatur wird gestartet...');
    setRepairFailed(false);

    const errorContext = JSON.stringify({
      type: 'data_loading',
      message: error.message,
      stack: (error.stack ?? '').split('\n').slice(0, 10).join('\n'),
      url: window.location.href,
    });

    try {
      const resp = await fetch(REPAIR_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ appgroup_id: APPGROUP_ID, error_context: errorContext }),
      });

      if (!resp.ok || !resp.body) {
        setRepairing(false);
        setRepairFailed(true);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const raw of lines) {
          const line = raw.trim();
          if (!line.startsWith('data: ')) continue;
          const content = line.slice(6);
          if (content.startsWith('[STATUS]')) {
            setRepairStatus(content.replace(/^\[STATUS]\s*/, ''));
          }
          if (content.startsWith('[DONE]')) {
            setRepairDone(true);
            setRepairing(false);
          }
          if (content.startsWith('[ERROR]') && !content.includes('Dashboard-Links')) {
            setRepairFailed(true);
          }
        }
      }
    } catch {
      setRepairing(false);
      setRepairFailed(true);
    }
  };

  if (repairDone) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-12 h-12 rounded-2xl bg-green-500/10 flex items-center justify-center">
          <IconCheck size={22} className="text-green-500" />
        </div>
        <div className="text-center">
          <h3 className="font-semibold text-foreground mb-1">Dashboard repariert</h3>
          <p className="text-sm text-muted-foreground max-w-xs">Das Problem wurde behoben. Bitte laden Sie die Seite neu.</p>
        </div>
        <Button size="sm" onClick={() => window.location.reload()}>
          <IconRefresh size={14} className="mr-1" />Neu laden
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-24 gap-4">
      <div className="w-12 h-12 rounded-2xl bg-destructive/10 flex items-center justify-center">
        <IconAlertCircle size={22} className="text-destructive" />
      </div>
      <div className="text-center">
        <h3 className="font-semibold text-foreground mb-1">Fehler beim Laden</h3>
        <p className="text-sm text-muted-foreground max-w-xs">
          {repairing ? repairStatus : error.message}
        </p>
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={onRetry} disabled={repairing}>Erneut versuchen</Button>
        <Button size="sm" onClick={handleRepair} disabled={repairing}>
          {repairing
            ? <span className="inline-block w-3.5 h-3.5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin mr-1" />
            : <IconTool size={14} className="mr-1" />}
          {repairing ? 'Reparatur läuft...' : 'Dashboard reparieren'}
        </Button>
      </div>
      {repairFailed && <p className="text-sm text-destructive">Automatische Reparatur fehlgeschlagen. Bitte kontaktieren Sie den Support.</p>}
    </div>
  );
}
