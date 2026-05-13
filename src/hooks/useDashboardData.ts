import { useState, useEffect, useMemo, useCallback } from 'react';
import type { Stammdaten, Aktivitaeten, Zuordnungen } from '@/types/app';
import { LivingAppsService } from '@/services/livingAppsService';

export function useDashboardData() {
  const [stammdaten, setStammdaten] = useState<Stammdaten[]>([]);
  const [aktivitaeten, setAktivitaeten] = useState<Aktivitaeten[]>([]);
  const [zuordnungen, setZuordnungen] = useState<Zuordnungen[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const fetchAll = useCallback(async () => {
    setError(null);
    try {
      const [stammdatenData, aktivitaetenData, zuordnungenData] = await Promise.all([
        LivingAppsService.getStammdaten(),
        LivingAppsService.getAktivitaeten(),
        LivingAppsService.getZuordnungen(),
      ]);
      setStammdaten(stammdatenData);
      setAktivitaeten(aktivitaetenData);
      setZuordnungen(zuordnungenData);
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Fehler beim Laden der Daten'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Silent background refresh (no loading state change → no flicker)
  useEffect(() => {
    async function silentRefresh() {
      try {
        const [stammdatenData, aktivitaetenData, zuordnungenData] = await Promise.all([
          LivingAppsService.getStammdaten(),
          LivingAppsService.getAktivitaeten(),
          LivingAppsService.getZuordnungen(),
        ]);
        setStammdaten(stammdatenData);
        setAktivitaeten(aktivitaetenData);
        setZuordnungen(zuordnungenData);
      } catch {
        // silently ignore — stale data is better than no data
      }
    }
    function handleRefresh() { void silentRefresh(); }
    window.addEventListener('dashboard-refresh', handleRefresh);
    return () => window.removeEventListener('dashboard-refresh', handleRefresh);
  }, []);

  const stammdatenMap = useMemo(() => {
    const m = new Map<string, Stammdaten>();
    stammdaten.forEach(r => m.set(r.record_id, r));
    return m;
  }, [stammdaten]);

  const aktivitaetenMap = useMemo(() => {
    const m = new Map<string, Aktivitaeten>();
    aktivitaeten.forEach(r => m.set(r.record_id, r));
    return m;
  }, [aktivitaeten]);

  return { stammdaten, setStammdaten, aktivitaeten, setAktivitaeten, zuordnungen, setZuordnungen, loading, error, fetchAll, stammdatenMap, aktivitaetenMap };
}