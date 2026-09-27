'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { useState, useEffect } from 'react';
import { Loader2, CalendarDays, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStatusLabel } from '@/lib/ticket-status';

const MIN_REASON_LENGTH = 20;

interface PendencyDialogProps {
  open:      boolean;
  status:    string;
  onConfirm: (reason: string, followUpDate: string) => Promise<void>;
  onCancel:  () => void;
}

export function PendencyDialog({ open, status, onConfirm, onCancel }: PendencyDialogProps) {
  const [reason,   setReason]   = useState('');
  const [followUp, setFollowUp] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  // Reset when dialog closes/opens
  useEffect(() => {
    if (!open) {
      setReason('');
      setFollowUp('');
      setError('');
    }
  }, [open]);

  const remaining = MIN_REASON_LENGTH - reason.trim().length;
  const reasonOk  = reason.trim().length >= MIN_REASON_LENGTH;

  // today's date in YYYY-MM-DD (local timezone)
  const todayStr = new Date().toISOString().split('T')[0];

  async function handleConfirm() {
    if (!reasonOk) { setError(`Justificativa deve ter pelo menos ${MIN_REASON_LENGTH} caracteres.`); return; }
    if (!followUp)  { setError('Data de follow-up é obrigatória.'); return; }
    if (followUp < todayStr) { setError('A data de follow-up não pode ser no passado.'); return; }

    setError('');
    setLoading(true);
    try {
      await onConfirm(reason.trim(), followUp);
      // reset is handled by useEffect on open = false
    } catch {
      setError('Erro ao salvar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }

  const label = getStatusLabel(status);

  return (
    <Dialog open={open} onOpenChange={v => { if (!v && !loading) onCancel(); }}>
      <DialogContent className="max-w-md" onInteractOutside={e => { if (loading) e.preventDefault(); }}>
        <DialogHeader>
          <DialogTitle>Mover para "{label}"</DialogTitle>
          <DialogDescription>
            Preencha a justificativa e a data de acompanhamento antes de mover o ticket.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          {/* Justificativa */}
          <div className="space-y-1.5">
            <Label className="flex items-center justify-between">
              <span>Justificativa <span className="text-red-500">*</span></span>
              <span className={cn(
                'text-[11px] font-normal transition-colors',
                remaining > 0 ? 'text-muted-foreground/70' : 'text-sem-success-fg',
              )}>
                {remaining > 0 ? `${remaining} caracteres restantes` : '✓ OK'}
              </span>
            </Label>
            <Textarea
              value={reason}
              onChange={e => { setReason(e.target.value); setError(''); }}
              placeholder="Descreva o motivo da pendência com detalhes suficientes..."
              rows={3}
              className={cn(
                'resize-none transition-colors',
                !reasonOk && reason.trim().length > 0
                  ? 'border-sem-warning-bd focus-visible:ring-amber-400'
                  : reasonOk
                    ? 'border-sem-success-bd focus-visible:ring-green-400'
                    : '',
              )}
            />
          </div>

          {/* Data de follow-up */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <CalendarDays className="h-3.5 w-3.5 text-muted-foreground/70" />
              Data de follow-up (FUP) <span className="text-red-500">*</span>
            </Label>
            <Input
              type="date"
              value={followUp}
              onChange={e => { setFollowUp(e.target.value); setError(''); }}
              min={todayStr}
              className="cursor-pointer"
            />
          </div>

          {/* Erro */}
          {error && (
            <div className="flex items-center gap-2 rounded-md bg-sem-error px-3 py-2 text-sm text-sem-error-fg">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onCancel}
            disabled={loading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={loading || !reasonOk || !followUp}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {loading
              ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Salvando...</>
              : 'Confirmar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
