# Refatoração Arquitetural Total — Portal de Suporte (`development`)

## Context

O portal (`SGC-CCODE/portal-suporte`, branch `development`) tem um **esqueleto saudável** (PR #110: route groups, `app/server/` MVC, sessão custom unificada, MinIO, pgvector, SPED validador único, sem `latest`). O problema não é o esqueleto — é que **~16 PRs de feature foram despejados sem usar as camadas compartilhadas**, gerando violação sistemática de **Encapsulamento, DRY e KISS**.

Auditoria profunda (3 agentes Explore, 2026-06-19) mediu o estado real:

- **240 rotas API, só ~25 passam por Controller→Service→Repository.** ~45–80% chamam `prisma.*` inline com regra de negócio no handler.
- **3 mecanismos de auth coexistem:** `auth.requireRequest` (76), `getSession()` inline (73), helpers custom. Sem porta única.
- **Cliente espelha o problema:** `app/lib/api/` existe mas ~1 componente usa; **63 componentes / 138 `fetch()` crus**; só **5 hooks** para 165 componentes.
- **Camadas vazadas:** matemática de SLA dentro de `ticket.repository.ts`; `ticket.service.ts` tem 536 linhas (CRUD+workflow+SLA+notificação — com TODOs próprios pedindo split).
- **Abstrações competindo "para a mesma coisa":** `apiHandler` (2 usos, fora da política) vs Controllers; `app/types/` vestigial (1 arquivo morto); labels/SLA/datas duplicados.
- **DRY:** maps de status/prioridade/severidade reescritos em 8–12 arquivos; SLA copiado em 4+ rotas; **67 `toLocaleString` inline** em vez de `formatDate()`; boilerplate loading+try/catch em 57 componentes; zod em ~3 rotas.
- **KISS:** 10 componentes >500 linhas (wizard 1463, kanban-board 1292, admin-ticket-details 813, kanban-card 803…) misturando UI+fetch+lógica; geração de PDF duplicada.

**Decisões do usuário (2026-06-19):** (1) **Refatoração total** — todas as rotas no padrão em camadas, todos os gigantes quebrados, componentes migrados para hooks. (2) **Padrão backend = o da política do Hefler.** (3) **Consolidar pastas.**

**Padrão oficial (confirmado em `docs/refactor-continuation.md` L100-106, L163, L195-196):** `route.ts` fino → **Controller → Service → Repository**; "**meta: zero Prisma direto em `route.ts`**". Logo o `apiHandler` funcional é débito a remover, não o alvo.

**Princípios-guia (aplicar sempre):** **Encapsulamento** (cada unidade um propósito, fronteira clara), **DRY** (uma fonte canônica, importar nunca recopiar), **KISS** (rota fina, função pequena, sem abstração supérflua).

**Processo (regra do projeto, inviolável):** cada slice = **1 branch + 1 PR revisável pelo Hefler antes do merge**; trabalho contra `development`; **NUNCA push em `master`**. Migrações de banco: aditivas, idempotentes, com rollback. Execução orquestrada sob a postura `senior-fullstack`, delegando slices a agentes especialistas (`aa-backend-engineer`, `aa-architecture`, `aa-frontend-engineer`) + revisão por `code-review`.

---

## Alvo arquitetural (estado final)

```
route.ts (fino, só delega)
   → Controller (auth + zod + resposta padronizada, estende BaseController)
      → Service (regra de negócio, pequeno e focado)
         → Repository (só acesso a dados; ZERO regra de negócio)
Fontes canônicas compartilhadas:
   lib/labels.ts        — STATUS/PRIORITY/SEVERITY (label+cor, famílias por audiência)
   lib/sla/*            — funções puras: minutesRemaining, isBreached, isAtRisk, conversão severidade
   lib/utils.ts         — formatDate (já existe; adotar em todo lugar)
   server/schemas/*     — DTOs zod (fronteira de toda rota)
   lib/api/<domínio>.ts — cliente HTTP por domínio (espelha server)
   _hooks/use-<domínio> — hook de dados por domínio + useFetch genérico
   _components/ui        — <StatusBadge>/<PriorityBadge>/<SlaIndicator> (únicos)
```

Tipos: **`app/db/types.ts` = entidades** (canônico) · **`app/server/models/*` = DTOs** · `app/types/` **removido**.

---

## Plano em ondas (cada item = 1 PR revisável; ordem = menor risco → maior)

### Onda 0 — Fundações canônicas (baixo risco, alavanca tudo)
- **`lib/labels.ts`**: unificar STATUS/PRIORITY/SEVERITY (estender `lib/ticket-status.ts`), com famílias `_SYSTEM`/`_CLIENT`/`_WHATSAPP`. Migrar os 8–12 duplicadores (`kanban-card.tsx:19-52`, `admin-dashboard.tsx:23-27`, `priority-badge.tsx`, `whatsapp-notify.ts`, `notifications.ts`…).
- **`lib/sla/index.ts`**: extrair `calculateMinutesRemaining`/`isBreached`/`isAtRisk` + conversão `P0↔P1` (hoje hardcoded em `ticket.service.ts`). Substituir as 4+ cópias em rotas e a math vazada em `ticket.repository.ts` e `sla.repository.ts`.
- **`server/schemas/`** + `BaseController.parseBody(schema)`: home de DTOs zod; portar os 2 usos de `apiHandler` e **deletar `app/lib/api-handler.ts`**.
- **Sweep `formatDate`**: substituir os 67 `new Date().toLocaleString("pt-BR")` por `formatDate()` (`lib/utils.ts`).
- **Limpeza de pastas**: remover `app/types/next-auth.d.ts` + pasta (0 imports, NextAuth inativo); corrigir comentário "Supabase"→Prisma em `app/server/index.ts`.

### Onda 1 — Unificação backend (240 rotas → padrão único), 1 domínio por PR
- Padrão por domínio: `route.ts` fino → controller (`requirePermission` + `parseBody`) → service → repository. Mover Prisma inline e regra de negócio para baixo; trocar os 73 `getSession()` inline por controller auth.
- **Tirar lógica vazada dos repositories** (SLA → `lib/sla`); **quebrar `ticket.service.ts`** (536 → use-cases: CRUD / workflow / mensagens / SLA), conforme TODOs L20-21.
- Eventos de domínio para efeitos colaterais (notificação, activity-log, IA, automação) — disparados no service, não no route.
- Lotes por domínio: tickets · companies · kb · ai · automation · sla · reports · settings · devops · whatsapp · filters · incidents. **Meta: zero `import { prisma }` em `app/api/**/route.ts`.**

### Onda 2 — Camada de dados do front, 1 domínio por PR
- Completar `lib/api/<domínio>.ts` (kb, companies, tasks, ai, admin, schedules…) espelhando os domínios do server.
- **`use-fetch.ts`** genérico (loading/error/abort) eliminando o boilerplate dos 57 componentes; hooks de domínio (`useTickets`, `useKB`, `useCompanies`…).
- Migrar os 63 componentes / 138 `fetch()` crus para hooks+client.

### Onda 3 — KISS / god components, 1 componente por PR
- Quebrar os 10 componentes >500 linhas (wizard 1463, kanban-board 1292, admin-ticket-details 813, kanban-card 803, FileExplorer 677, admin-dashboard 652…): extrair hooks + subcomponentes + usar a nova camada de API.
- `<StatusBadge>/<PriorityBadge>/<SlaIndicator>` em todo lugar; matar maps inline.
- Deduplicar geração de PDF em `server/lib/pdf/`.

### Onda 4 — Trava de regressão
- ESLint rule custom: proibir `import { prisma }` em `app/api/**/route.ts` e `const STATUS_LABELS`/`PRIORITY_LABELS` em componentes; remover `typescript.ignoreBuildErrors` (se ainda ligado).
- Atualizar `app/STRUCTURE.md` + `docs/refactor-continuation.md` com o padrão final.

> **Nota:** NÃO realocar fisicamente arquivos de `app/api/` — o caminho da pasta É a URL pública. Agrupamento por domínio só via `(grupo)` (não muda URL); baixo valor, fora de escopo.

---

## Arquivos/símbolos críticos a reutilizar (não recriar)
- `app/server/controllers/base.controller.ts` — já tem `requirePermission/requireAdmin/handleRequest`; **adicionar** `parseBody(zod)`.
- `app/lib/ticket-status.ts` / `ticket-transitions.ts` — base dos labels; estender, não duplicar.
- `app/lib/utils.ts` `formatDate/formatDateShort` — canônico de data.
- `app/lib/storage.ts` (MinIO) e `app/lib/sped/validator.ts` — já limpos; preservar.
- `app/lib/api/{client,tickets,notifications}.ts` — base do client; expandir por domínio.
- `app/db/types.ts` — fonte de tipos; DTOs só em `app/server/models/`.

## Verificação (a cada PR)
1. `npx tsc --noEmit` sem novos erros no escopo do PR.
2. `npm run build` passa (tratar `ssh2`/`ignoreBuildErrors` como pré-existente até a Onda 4).
3. `npm run dev` + smoke das URLs tocadas (`/`, `/criar-ticket`, `/acompanhar`, `/admin`, `/admin/kanban`, `/dashboard`).
4. Onda 1: grep de regressão — `import { prisma }` em `app/api/**/route.ts` cai a cada domínio; `getSession()` inline some.
5. Onda 0/2/3: grep — `toLocaleString` inline → 0; `const STATUS_LABELS`/`PRIORITY_LABELS` em componentes → 0; `fetch(` cru em `_components` → 0.
6. Migrações de banco (se houver): aplicar em cópia do dump + rollback documentado.
7. Revisão do Hefler aprovando o PR antes do merge em `development`.

## Salvar o plano
Na aprovação, copiar este plano para `docs/plans/plano-refatoracao-arquitetura-portal-suporte.md` (convenção do projeto: planos versionados em `docs/plans/`, nunca deletar antigos).
