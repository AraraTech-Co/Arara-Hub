# Refatoração do projeto — guia de continuação

Documento para retomar o trabalho após o PR da branch `refactor/project-refactor`.

**Última atualização:** junho/2026  
**Detalhes do front:** ver também [`app/STRUCTURE.md`](../app/STRUCTURE.md)

---

## Contexto

Projeto Next.js 15 (App Router) herdado com código espalhado na raiz do repo. A refatoração consolidou código sob `app/` e reorganizou o front por audiência, **sem alterar URLs públicas**.

Stack principal: Next.js 15, Prisma, sessão customizada (`portal_session`) + NextAuth parcial, ~224 API routes, shadcn/ui.

---

## O que já foi feito

### 1. Consolidação sob `app/`

| Antes (raiz) | Depois |
|--------------|--------|
| `components/` | `app/_components/` |
| `hooks/` | `app/_hooks/` |
| `lib/` | `app/lib/` |
| `backend/` | `app/server/` |
| `db/` | `app/db/` |
| `types/` | `app/types/` |
| `auth.ts`, `auth.config.ts` | `app/lib/auth/` |

**Permanece na raiz do repo:** `package.json`, `package-lock.json`, `middleware.ts`, `instrumentation.ts`, configs Sentry, `prisma/`, `public/`, `pages/` (legado DevOps).

### 2. Limpeza da raiz

- Removidos: `nginx/`, `styles/` (duplicado de `app/globals.css`)
- Scripts ops movidos para `app/migrations/` (se existir no branch; SQL legado + utilitários)
- `SSH Manager/` — protótipo Python Flask; **ainda não removido** (referência para DevOps fase 2)

### 3. DevOps — fase 1 (Docker real)

Novos módulos em `app/lib/devops/`:

- `auth.ts` — `requireDevOpsAdmin()`
- `ssh-exec.ts` — `execSsh()`
- `docker.ts` — list, lifecycle, logs, stats

APIs em `app/api/devops/[serverId]/containers/*`  
UI: `app/(admin)/admin/devops/[serverId]/docker/page.tsx` (sem MOCK)

### 4. Front — route groups por audiência

| Grupo | Caminho | URLs (inalteradas) |
|-------|---------|-------------------|
| `(public)` | `app/(public)/` | `/`, `/criar-ticket`, `/acompanhar`, `/ticket-criado`, `/avaliar/[token]` |
| `(auth)` | `app/(auth)/auth/` | `/auth/*` |
| `(client)` | `app/(client)/dashboard/` | `/dashboard/*` |
| `(admin)` | `app/(admin)/admin/` | `/admin/*` |

Layouts pass-through criados em `(public)`, `(auth)`, `(client)`. Admin mantém `AdminLayoutShell` em `(admin)/admin/layout.tsx`.

### 5. Aliases TypeScript (`tsconfig.json`)

```json
"@/components/*" → "./app/_components/*"
"@/hooks/*"      → "./app/_hooks/*"
"@/admin/*"      → "./app/(admin)/admin/*"
"@/*"            → "./app/*"
"@/auth"         → "./app/lib/auth"
```

Imports `@/components/ui/button` e `@/admin/validador-sped/actions` continuam válidos.

---

## Arquitetura atual (visão geral)

```
app/
├── (public)/          # visitante — rotas públicas
├── (auth)/auth/       # login, signup, reset
├── (client)/dashboard/# portal do cliente
├── (admin)/admin/     # painel operacional
├── _components/       # UI compartilhada (privado, sem rota)
├── _hooks/
├── lib/               # utilitários, auth, prisma, devops, security
├── server/            # MVC: controllers → services → repositories
├── api/               # Route Handlers HTTP (~224 rotas)
├── db/, types/
├── layout.tsx, globals.css, not-found.tsx, global-error.tsx
└── uploads/

middleware.ts          # rate limit, CSRF, RBAC por cookie portal_role
prisma/                # schema + migrations
pages/api/devops/      # legado: terminal.js, sftp.js (ssh2 via Pages Router)
```

### Papel de `app/server/`

Não é convenção do Next — é camada de domínio (MVC) consumida por `app/api/`:

```
app/api/tickets/route.ts  →  ticketController  →  ticketService  →  ticketRepository
```

Parte das APIs usa `@/server`; muitas ainda têm lógica inline no `route.ts` (dívida técnica).

---

## Problemas conhecidos (não introduzidos pela refatoração do front)

| Problema | Onde | Impacto |
|----------|------|---------|
| Build falha no `ssh2` | `app/api/admin/ssh-servers/execute/route.ts` | Webpack tenta bundlar binário nativo `.node` |
| `typescript.ignoreBuildErrors: true` | `next.config.mjs` | Erros TS mascarados no build |
| Auth dual | `app/lib/auth/` + `app/api/auth/[...nextauth]/` | Inconsistências de sessão |
| Rotas API sem guard | várias em `app/api/` | Risco de segurança (auditoria pendente) |
| God components | `_components/kanban/`, ticket details | Manutenção difícil |
| `pages/api/devops/*` | Pages Router legado | Terminal/SFTP fora do App Router |

### Build

```bash
npm run build
# Falha esperada: sshcrypto.node em ssh2 (execute route)
# Rotas refatoradas do front compilam após fix do alias @/admin/*
```

Validação alternativa:

```bash
npx tsc --noEmit   # muitos erros pré-existentes em app/server/
npm run dev        # smoke manual das URLs
```

### Smoke test de URLs (pós-refatoração)

- `/`, `/criar-ticket`, `/acompanhar`, `/auth/login`
- `/dashboard`, `/admin`, `/admin/kanban`
- `/avaliar/[token]` (com token válido)
- Middleware: client → `/admin` redireciona para `/dashboard`

---

## Próximos passos (prioridade sugerida)

### P0 — Estabilizar CI/build

1. **Corrigir `ssh2` no App Router** — `serverExternalPackages: ['ssh2']` no `next.config.mjs` ou mover execução SSH para route dinâmica/edge-safe; avaliar unificar com `app/lib/devops/ssh-exec.ts`.
2. **Remover `ignoreBuildErrors`** gradualmente — começar por `app/server/repositories/` e controllers.

### P1 — Front (incremental, baixo risco)

1. **Extrair shells duplicados** nos layouts:
   - `(auth)/layout.tsx` — painel split login/signup (hoje repetido em cada page)
   - `(public)/layout.tsx` — header/footer público (`criar-ticket`, `acompanhar`)
   - `(client)/layout.tsx` — nav do dashboard
2. **Unificar `minha-conta`** — existe em admin e client com código parecido.
3. **Quebrar god components** — kanban, `ticket-details`, `admin-ticket-details` (uma tela por PR).

### P2 — Backend / API

1. **Padronizar `app/api/`** — rotas finas delegando para `app/server/`; meta: zero Prisma direto em `route.ts`.
2. **Organizar `app/api/`** — opcional: subpastas por domínio espelhando `server/` (sem mudar URLs `/api/...`).
3. **Migrar `pages/api/devops/terminal.js` e `sftp.js`** para App Router + `@/lib/devops/ssh-exec.ts`.

### P3 — DevOps fase 2 (SSH Manager)

Referência: pasta `SSH Manager/` (Python).

- [ ] SSE para logs de container em tempo real
- [ ] ErrorAnalyzer (port do Python)
- [ ] Operações de arquivo em container
- [ ] Grid multi-servidor (se aplicável)
- [ ] Remover `SSH Manager/` após paridade

APIs Docker já existentes: `GET/POST/DELETE app/api/devops/[serverId]/containers/*`

### P4 — Segurança e auth

- Unificar sessão (escolher session custom vs NextAuth)
- Auditar guards em todas as rotas `app/api/admin/*` e `app/api/devops/*`
- Revisar rotas públicas sensíveis (`/api/tickets/public`, impersonate, etc.)

---

## Convenções para novos arquivos

| Tipo | Onde |
|------|------|
| Página (RSC) | `app/(grupo)/.../page.tsx` — fina, fetch + composição |
| Interatividade da tela | `*-client.tsx` na **mesma pasta** da rota |
| Componente reutilizável | `app/_components/{domínio}/` |
| Hook compartilhado | `app/_hooks/` |
| Lógica de negócio | `app/server/services/` |
| HTTP handler | `app/api/.../route.ts` — delegar para controller |
| Server action colocalizado | `app/(admin)/admin/{feature}/actions.ts` — import via `@/admin/...` |

**shadcn:** `npx shadcn@latest add` → grava em `app/_components/ui/` (via alias `@/components`).

---

## O que NÃO mover (sem decisão explícita)

- `middleware.ts` — paths absolutos `/admin`, `/dashboard`
- `app/api/` — convenção Next para HTTP (reorganizar conteúdo, não a pasta)
- `prisma/` — schema e migrations oficiais
- URLs públicas — route groups já garantem paths iguais

---

## Checklist para o PR atual

- [ ] ~248 arquivos renomeados/movidos (route groups + `_components` + `_hooks`)
- [ ] `tsconfig.json` com aliases `@/components`, `@/hooks`, `@/admin`
- [ ] `app/STRUCTURE.md` + este documento
- [ ] URLs inalteradas; `middleware.ts` sem mudanças
- [ ] Build ainda pode falhar em `ssh2` — mencionar no PR como pré-existente
- [ ] Testar `npm run dev` e fluxos login → dashboard / admin

### Sugestão de título/descrição do PR

**Título:** `refactor: reorganize app directory with route groups and private folders`

**Corpo (resumo):**
- Consolida código sob `app/` e separa rotas por audiência `(public)`, `(auth)`, `(client)`, `(admin)`
- Renomeia `components` → `_components`, `hooks` → `_hooks`
- Adiciona aliases TS; URLs e middleware inalterados
- Documenta estrutura em `app/STRUCTURE.md` e `docs/refactor-continuation.md`

---

## Referências no repo

| Arquivo | Conteúdo |
|---------|----------|
| [`app/STRUCTURE.md`](../app/STRUCTURE.md) | Estrutura do front e convenções |
| [`app/server/index.ts`](../app/server/index.ts) | Guia MVC e exemplos de uso |
| [`middleware.ts`](../middleware.ts) | RBAC por `portal_role` |
| [`components.json`](../components.json) | Aliases shadcn |
| [`SSH Manager/README.md`](../SSH%20Manager/README.md) | Protótipo DevOps legado |
| [`docs/2026-05-29-sped-validator-design.md`](./2026-05-29-sped-validator-design.md) | Design do validador SPED |

---

## Contato / handoff

Ao retomar: ler este doc + `app/STRUCTURE.md`, rodar `git checkout refactor/project-refactor` (ou branch mergeada), `npm install`, `npm run dev`.

Próximo PR sugerido: **P0 ssh2 build fix** ou **P1 layouts auth/public** — escolher um foco por PR para revisão fácil.
