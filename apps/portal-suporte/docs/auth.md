# Autenticação e autorização

Sistema **custom** baseado em sessão (`portal_session`) com hierarquia configurável via JSON.

## Níveis de acesso

Definidos em [`config/access-control.json`](../config/access-control.json):

| Nível | Rank | Uso típico |
|-------|------|------------|
| `user` | 10 | Clientes — portal `/dashboard` |
| `developer` | 20 | Operadores — kanban, tickets, devops |
| `admin` | 30 | Gestão — analytics, audit, automation |
| `master` | 40 | Configuração — users, settings, permissions |

**Hierarquia inclusiva:** rota com `minLevel: "developer"` permite `developer`, `admin` e `master`.

### Nível customizado

Adicione em `levels` no JSON (ex.: `unicornio` com `rank: 25` entre developer e admin). Sem alteração de código.

## Cookies

| Cookie | HttpOnly | Função |
|--------|----------|--------|
| `portal_session` | sim | Token UUID da sessão no banco |
| `portal_access_level` | não | Nível para middleware Edge (UX); servidor revalida via `Profile.role` |

## Middleware ([`middleware.ts`](../middleware.ts))

1. Rotas públicas em `publicPaths` — liberadas
2. `/admin/**` e `/dashboard/**` — exige `portal_session` ou `x-api-key` (APIs)
3. Checa `portal_access_level` contra `minLevel` da rota no JSON
4. Sem sessão → redirect `/auth/login` (páginas) ou 401 (API)

## API unificada (`@/lib/auth`)

```typescript
import { auth, verify } from '@/lib/auth'
```

| Caso | Uso |
|------|-----|
| Checar nível ou rota | `verify('admin', session)` ou `verify('/admin/kanban', session)` |
| Staff (developer+) | `verify('developer', actor)` |
| Cliente (não staff) | `!verify('developer', actor)` |
| Server Component autenticado | `await auth.requireAuthenticated()` |
| Server Component com permissão | `await auth.require('developer')` ou `await auth.require('/admin')` |
| Route Handler (sessão) | `await auth.requireRequest(req)` ou `await auth.requireRequest(req, 'admin')` |
| Route Handler (sessão + API key) | `await auth.verifyRequest(req)` ou `await auth.verifyRequest(req, 'developer')` |

### Exemplo — API route

```typescript
import { auth } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const authResult = await auth.verifyRequest(request)
  if (authResult instanceof NextResponse) return authResult
  // authResult.type === 'session' | 'apiKey'
}
```

### Exemplo — Server Component

```typescript
import { auth } from '@/lib/auth'

export default async function AdminPage() {
  await auth.require('developer')
  // ...
}
```

## Nova rota protegida

Adicione em `config/access-control.json`:

```json
{ "pattern": "/admin/minha-feature", "minLevel": "developer" }
```

Ou confie no `floorLevel` do contexto (`/admin` → default `developer`).

## API Keys

Campos em `api_keys`:

- `access_level` — teto hierárquico (`admin`, `developer`, etc.)
- `route_grants` — whitelist opcional de patterns
- `route_denials` — blacklist (ex.: negar `/admin/automation`)

Exemplo: nível `admin` + `route_denials: ["/admin/automation"]` → analytics sim, automation não.

Header: `x-api-key: sk_live_...`

## Roles no banco (`Profile.role`)

Enum Prisma: `master | admin | developer | user`

Migração legado:

| Antigo | Novo |
|--------|------|
| super_admin | master |
| admin, manager, supervisor | admin |
| agent | developer |
| client | user |

## Removido

- **NextAuth** — provider e `/api/auth/[...nextauth]` removidos
- RBAC DB (`rbac_roles`) — deprecated; usar JSON
- `roles.ts`, `authorize.ts` — substituídos por `auth.verify()` e `auth.verifyRequest()`

## Arquivos principais

| Arquivo | Papel |
|---------|-------|
| `config/access-control.json` | Níveis, contextos, rotas |
| `app/lib/auth/access-control.ts` | Match de rotas e ranks |
| `app/lib/auth/auth.ts` | `auth` — require, verifyRequest, requireRequest |
| `app/lib/auth/verify.ts` | `verify()` — checagem de nível/rota |
| `app/lib/auth/guards.ts` | Rate limit, CSRF, password policy (não-auth) |
| `app/lib/session.ts` | Sessão e cookies |
