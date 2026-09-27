'use client'

// =============================================================================
// PendenciaSubTypeDialog — picker de tipo de pendência externa ao mover ticket
// para a coluna virtual "Pendência".
//
// Sprint A (PRD): 8 tipos externos obrigatórios conforme PRD Adicional §3:
//   Cliente | Parceiro | Fornecedor | Infraestrutura | Financeiro |
//   Fiscal | Operadora | Outro
//
// Cada tipo mapeia para um DB status:
//   "cliente" → aguardando_cliente
//   demais    → pendencia_suporte (dependência externa genérica)
// =============================================================================

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'

export type PendenciaRealStatus = 'pendencia_suporte' | 'pendencia_dev' | 'aguardando_cliente'

export interface PendencySubSelection {
  dbStatus: PendenciaRealStatus
  pendencyType: string
}

interface SubOption {
  type: string
  dbStatus: PendenciaRealStatus
  label: string
  description: string
  className: string
}

const SUB_OPTIONS: SubOption[] = [
  {
    type: 'cliente',
    dbStatus: 'aguardando_cliente',
    label: '⏳ Aguardando Cliente',
    description: 'Pendente de retorno ou informação do cliente',
    className: 'border-sem-warning-bd hover:bg-sem-warning text-sem-warning-fg',
  },
  {
    type: 'parceiro',
    dbStatus: 'pendencia_suporte',
    label: '🤝 Parceiro',
    description: 'Aguardando ação de parceiro externo',
    className: 'border-blue-300 hover:bg-sem-info text-sem-info-fg',
  },
  {
    type: 'fornecedor',
    dbStatus: 'pendencia_suporte',
    label: '📦 Fornecedor',
    description: 'Aguardando fornecedor de produto ou serviço',
    className: 'border-status-testing-bd hover:bg-status-testing text-status-testing-fg',
  },
  {
    type: 'infraestrutura',
    dbStatus: 'pendencia_suporte',
    label: '🖥️ Infraestrutura',
    description: 'Aguardando servidor, rede ou ambiente externo',
    className: 'border-status-triage-bd hover:bg-status-triage text-status-triage-fg',
  },
  {
    type: 'financeiro',
    dbStatus: 'pendencia_suporte',
    label: '💰 Financeiro',
    description: 'Aguardando liberação ou pagamento financeiro',
    className: 'border-sem-success-bd hover:bg-sem-success text-sem-success-fg',
  },
  {
    type: 'fiscal',
    dbStatus: 'pendencia_suporte',
    label: '📄 Fiscal',
    description: 'Aguardando SEFAZ, certificado ou autorização fiscal',
    className: 'border-status-backlog-bd hover:bg-status-backlog text-status-backlog-fg',
  },
  {
    type: 'operadora',
    dbStatus: 'pendencia_suporte',
    label: '📡 Operadora / Adquirente',
    description: 'Aguardando operadora de cartão, TEF ou adquirente',
    className: 'border-status-pending-bd hover:bg-status-pending text-status-pending-fg',
  },
  {
    type: 'dev',
    dbStatus: 'pendencia_dev',
    label: '🟣 Pendência DEV',
    description: 'Aguardando time de desenvolvimento interno',
    className: 'border-status-pending-dev-bd hover:bg-status-pending-dev text-status-pending-dev-fg',
  },
  {
    type: 'outro',
    dbStatus: 'pendencia_suporte',
    label: '🔧 Outro',
    description: 'Dependência externa não categorizada acima',
    className: 'border-border hover:bg-muted/50 text-foreground',
  },
]

interface PendenciaSubTypeDialogProps {
  open: boolean
  onPick: (selection: PendencySubSelection) => void
  onCancel: () => void
}

export function PendenciaSubTypeDialog({ open, onPick, onCancel }: PendenciaSubTypeDialogProps) {
  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onCancel() }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>⏸️ Qual o tipo de pendência externa?</DialogTitle>
          <DialogDescription>
            Selecione a dependência externa que está bloqueando o atendimento.
            Pendência representa apenas dependências fora do time.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 grid grid-cols-2 gap-2">
          {SUB_OPTIONS.map(opt => (
            <button
              key={opt.type}
              type="button"
              onClick={() => onPick({ dbStatus: opt.dbStatus, pendencyType: opt.type })}
              className={`rounded-lg border-2 px-3 py-2.5 text-left transition-colors ${opt.className}`}
            >
              <p className="text-sm font-semibold">{opt.label}</p>
              <p className="mt-0.5 text-[11px] opacity-70 leading-tight">{opt.description}</p>
            </button>
          ))}
        </div>

        <div className="mt-2 flex justify-end">
          <Button variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
