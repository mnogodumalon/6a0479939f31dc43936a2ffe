import type { Zuordnungen, Stammdaten, Aktivitaeten } from '@/types/app';
import { extractRecordId } from '@/services/livingAppsService';
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { IconPencil } from '@tabler/icons-react';
import { format, parseISO } from 'date-fns';
import { de } from 'date-fns/locale';

function formatDate(d?: string) {
  if (!d) return '—';
  try { return format(parseISO(d), 'dd.MM.yyyy', { locale: de }); } catch { return d; }
}

interface ZuordnungenViewDialogProps {
  open: boolean;
  onClose: () => void;
  record: Zuordnungen | null;
  onEdit: (record: Zuordnungen) => void;
  stammdatenList: Stammdaten[];
  aktivitaetenList: Aktivitaeten[];
}

export function ZuordnungenViewDialog({ open, onClose, record, onEdit, stammdatenList, aktivitaetenList }: ZuordnungenViewDialogProps) {
  function getStammdatenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return stammdatenList.find(r => r.record_id === id)?.fields.nachname ?? '—';
  }

  function getAktivitaetenDisplayName(url?: unknown) {
    if (!url) return '—';
    const id = extractRecordId(url);
    return aktivitaetenList.find(r => r.record_id === id)?.fields.titel ?? '—';
  }

  if (!record) return null;

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Zuordnungen anzeigen</DialogTitle>
        </DialogHeader>
        <div className="flex justify-end">
          <Button size="sm" onClick={() => { onClose(); onEdit(record); }}>
            <IconPencil className="h-3.5 w-3.5 mr-1.5" />
            Bearbeiten
          </Button>
        </div>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Person</Label>
            <p className="text-sm">{getStammdatenDisplayName(record.fields.person)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Aktivität</Label>
            <p className="text-sm">{getAktivitaetenDisplayName(record.fields.aktivitaet)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Zuordnungsdatum</Label>
            <p className="text-sm">{formatDate(record.fields.zuordnungsdatum)}</p>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Rolle/Teilnahmeart</Label>
            <Badge variant="secondary">{record.fields.rolle?.label ?? '—'}</Badge>
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Bemerkungen</Label>
            <p className="text-sm whitespace-pre-wrap">{record.fields.bemerkungen ?? '—'}</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}