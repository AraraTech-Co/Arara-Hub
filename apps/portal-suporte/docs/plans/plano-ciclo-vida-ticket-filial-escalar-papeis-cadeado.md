# Plano — Ciclo de vida do ticket: filial, escalar-para, 3 papéis e cadeado da descrição

## Context

Lista de requisitos do WhatsApp (11/jun) sobre o card e o ciclo de vida do ticket. A
auditoria do código mostrou que **a maior parte já existe** (PRD B1/Sprint A): o bloqueio
da descrição fora de backlog/triagem está completo (front+back), o histórico de responsável
(`OwnerHistory`) tem model + timeline, e os papéis criador/solicitante/responsável existem no
schema. Restam **4 lacunas pontuais**, todas decididas com o usuário:

1. **Filial não é gravada** — o wizard envia `unit_id`, mas o `CreateTicketDTO` não tem o
   campo e o `repository.create` não persiste `unitId`/`companyId`. Decisão: **gravar
   estruturado** (FK real) e exibir no card.
2. **Escalar-para não tem UI** — o endpoint só marca `SLATracking.escalated`. Decisão:
   **escalar PARA X = reatribuir X como responsável + registrar em `OwnerHistory` + marcar
   escalado**, unindo escalação ao histórico.
3. **3 papéis não rotulados** — Decisão: mostrar **Solicitante / Quem recebeu / Responsável**
   no **card e no detalhe**.
4. **Descrição travada sem indicação visual** — a lógica existe; falta o **cadeado/aviso**.

**Zero migrations novas** — todas as colunas/models já existem. Risco baixo.
Convenção do projeto: na aprovação, copiar este plano para
`docs/plans/plano-ciclo-vida-ticket-filial-escalar-papeis-cadeado.md`.

---

## Mudança 1 — Filial estruturada (gravar + exibir)

**Backend**
- `app/server/models/ticket.models.ts`: adicionar `company_id?` e `unit_id?` (nullable) ao
  `CreateTicketSchema` (zod) e à interface `CreateTicketDTO`. Idem em `UpdateTicketDTO`.
- `app/server/repositories/ticket.repository.ts`:
  - `create()` (~L173): persistir `companyId: dto.company_id ?? null`, `unitId: dto.unit_id ?? null`.
  - `TICKET_INCLUDE` (L13): incluir `unit: { select: { id, name, city, state } }` e
    `company: { select: { id, name } }`.
  - `serializeTicket()` (~L21): emitir `unit: t.unit ? {...} : null` e `unit_id`/`company_id`.
  - `update()` deve aceitar `unitId`/`companyId` quando vierem no DTO.

**Frontend**
- `app/_components/kanban/kanban-card.tsx` Row 4 (L587-602): abaixo da empresa, se
  `ticket.unit`, renderizar linha de filial com ícone (`Store`/`MapPin`) + `unit.name`.
- `app/(admin)/admin/tickets/[id]/page.tsx` e `ticket-detail-modal.tsx`: repassar `unit` ao detalhe.

## Mudança 2 — Escalar para [pessoa] = reatribuir + histórico + escalado

**Backend (compõe métodos existentes)**
- `app/server/services/ticket.service.ts`: novo `escalateTo(ticketId, toUserId, byUserId, reason?)`:
  1. reaproveita a lógica de `assign()` (L359) → seta `assignedTo` + cria `OwnerHistory`
     `{ fromUserId, toUserId, changedById: byUserId, reason }`;
  2. chama `slaService.escalate(ticketId, toUserId)` (sla.service.ts:62) → `escalated=true`,
     `escalatedAt`, `escalatedTo`;
  3. `logActivity(byUserId, 'ticket_escalated', ...)` + `notifyAssigned`.
- `app/server/controllers/ticket.controller.ts`: handler `escalate(request, id)` (requer
  agente) lendo `{ to_user_id, reason }`.
- `app/api/tickets/[id]/escalate/route.ts`: POST → `ticketController.escalate`.
- `app/lib/api/tickets.ts`: `escalate(id, toUserId, reason?)`.

**Frontend**
- Detalhe (`admin-ticket-details.tsx`): bloco do Responsável ganha botão **"Escalar"** →
  popover com lista de agentes (prop `agents` já existe) + campo de motivo opcional → chama
  `ticketsApi.escalate`. Atualiza responsável + timeline (já lê `/owner-history`).
- Card (`kanban-card.tsx`): nas ações de hover (L620-677), popover **Escalar** (padrão do
  `QuickPriorityPopover`, listando agentes). Mantém o badge `🚨 ESC` existente.

## Mudança 3 — 3 papéis rotulados (Solicitante / Quem recebeu / Responsável)

**Fontes**: Solicitante = `ticket.requester` (texto). Quem recebeu = 1º `OwnerHistory.toUser`
(menor `changedAt`); fallback = criador. Responsável = `assignee` atual.

**Backend**
- `TICKET_INCLUDE`: incluir `ownerHistory: { take: 1, orderBy: { changedAt: 'asc' },
  include: { toUser: { select: { id, fullName, email } } } }` (1 join, evita N+1).
- `serializeTicket()`: emitir `received_by: t.ownerHistory?.[0]?.toUser ?? null`.

**Frontend**
- Detalhe: bloco rotulado com os 3 papéis (ícones + nomes).
- Card: a linha do solicitante ganha rótulo curto "Solic."; manter avatar do responsável
  (tooltip já diz "Responsável"); "Recebeu" como linha discreta só quando diferente do
  responsável, para não poluir os 260px.

## Mudança 4 — Cadeado visual na descrição

- `admin-ticket-details.tsx`: usa `isDescriptionLocked` (L152, já existe). Quando travado:
  textarea read-only/disabled + ícone `Lock` e aviso "Descrição travada após a triagem
  (editável só em Backlog/Triagem)". Admin/master continua editando.
- (Opcional) mini-cadeado no card quando o status não está em backlog/triagem.

---

## Arquivos críticos
- `app/server/repositories/ticket.repository.ts` — `TICKET_INCLUDE`, `create`, `serializeTicket`, `update`
- `app/server/services/ticket.service.ts` — `assign` (reuso) + novo `escalateTo`
- `app/server/services/sla.service.ts` — `escalate` (reuso)
- `app/server/models/ticket.models.ts` — DTOs zod (company_id/unit_id)
- `app/server/controllers/ticket.controller.ts` + `app/api/tickets/[id]/escalate/route.ts`
- `app/lib/api/tickets.ts` — cliente `escalate`
- `app/_components/kanban/kanban-card.tsx` — filial, papéis, popover escalar
- `app/_components/tickets/admin-ticket-details.tsx` — escalar, 3 papéis, cadeado
- `app/_components/tickets/ticket-timeline.tsx` — já mostra owner-history (sem mudança)

## Verificação
1. `npx tsc --noEmit` e `npm run build` sem novos erros.
2. `npm run dev`: criar ticket com empresa+filial → card mostra a filial.
3. Mover ticket além da triagem → descrição com cadeado e read-only; admin ainda edita.
4. Escalar para um agente → responsável muda, badge `🚨 ESC`, timeline registra
   "Responsável alterado: X → Y", `received_by` preenchido.
5. Detalhe e card exibem Solicitante/Quem recebeu/Responsável corretamente.
6. Cada entrega = 1 PR para `development` (revisão do Hefler); nunca push direto em `master`.
