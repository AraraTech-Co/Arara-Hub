# Estrutura do diretório `app/`

Guia de organização do front-end após a refatoração por audiência.

## Route groups (URLs inalteradas)

Pastas `(nome)` organizam rotas sem alterar a URL.

| Grupo | Caminho | URLs |
|-------|---------|------|
| `(public)` | `app/(public)/` | `/`, `/criar-ticket`, `/acompanhar`, `/ticket-criado`, `/avaliar/[token]` |
| `(auth)` | `app/(auth)/auth/` | `/auth/login`, `/auth/sign-up`, etc. |
| `(client)` | `app/(client)/dashboard/` | `/dashboard/*` |
| `(admin)` | `app/(admin)/admin/` | `/admin/*` |

## Código não-rota (raiz de `app/`)

| Pasta | Propósito |
|-------|-----------|
| `_components/` | Componentes React reutilizáveis (prefixo `_` = privado, sem rota) |
| `_hooks/` | Hooks compartilhados |
| `lib/` | Utilitários, auth, prisma, integrações |
| `server/` | Controllers, services, repositories |
| `db/`, `types/` | Tipos e acesso a dados |
| `api/` | Route handlers da API |
| `uploads/` | Servir arquivos enviados |

## Aliases TypeScript

```json
"@/components/*" → "./app/_components/*"
"@/hooks/*"      → "./app/_hooks/*"
"@/admin/*"      → "./app/(admin)/admin/*"
"@/*"            → "./app/*"
```

Imports existentes como `@/components/ui/button` continuam válidos.

## Convenções de arquivos

### `page.tsx`

Server Component fino na pasta da rota: fetch de dados + composição de componentes.

### `*-client.tsx`

Colocado **na mesma pasta da rota** quando a interatividade é específica da tela (padrão admin).

Exemplo: `app/(admin)/admin/teams/teams-client.tsx` importado por `page.tsx` na mesma pasta.

### Componentes reutilizáveis

Em `_components/{domínio}/`, espelhando a audiência:

- `_components/admin/` — painel administrativo
- `_components/dashboard/` — portal do cliente
- `_components/public/` — fluxos públicos (tickets, landing)
- `_components/ui/` — shadcn/ui (gerado via CLI)
- `_components/devops/`, `_components/kanban/`, etc. — domínios transversais

### Layouts

- `app/layout.tsx` — html, fonts, providers globais
- `app/(grupo)/layout.tsx` — shell por audiência (hoje pass-through; extrair markup duplicado incrementalmente)
- `app/(admin)/admin/layout.tsx` — shell do painel admin (`AdminLayoutShell`)

## shadcn/ui

`components.json` aponta para `@/components` e `@/hooks`. Novos componentes são gravados em `app/_components/ui/`.

## Camada de API do front-end (Ondas 2-3)

`app/lib/api/<domínio>.ts` — clientes HTTP tipados (tickets, companies, admin, kb, whatsapp…).
`app/_hooks/use-<domínio>.ts` — hooks de dados usando `useFetch`/`useMutation`.

Componentes **não devem** fazer `fetch()` diretamente — usem os hooks/clientes.

## Padrão de backend (Onda 1)

`app/api/**/route.ts` → Controller → Service → Repository.
`app/server/controllers/`, `services/`, `repositories/` organizam cada domínio.

**Não importe `prisma` diretamente em `route.ts`** — pertence ao Repository.
O `eslint.config.mjs` emite `warn` ao violar esta regra (`npm run lint`).

## Documentação relacionada

- [`docs/auth.md`](../docs/auth.md) — autenticação e autorização
- [`docs/refactor-continuation.md`](../docs/refactor-continuation.md) — histórico da refatoração e próximos passos
- [`docs/README.md`](../docs/README.md) — índice da documentação

## O que não mover

- `middleware.ts` na raiz do repo (paths absolutos `/admin`, `/dashboard`)
- `app/api/` — convenção Next.js para API routes
- `package.json` e `package-lock.json` — ficam na **raiz do repositório**, não em `app/` (rodar `npm install` sempre a partir da raiz)
- Server actions colocalizados em rotas admin (ex.: `validador-sped/actions.ts`) — importar via `@/admin/...`
