# Arara Hub — client-only na Arara Platform

Porta de entrada única da Arara: **um login → grade dos apps que a pessoa tem direito → escolhe e entra (SSO) + notificações**.

```text
Browser (Next static)  →  api.arara-tech.com
                            ├─ /v1/auth/login|me         (identidade compartilhada)
                            ├─ /v1/r/arara-hub/sso/criar  (handoff SSO — mint do código)
                            ├─ /v1/r/arara-hub/me/profile (papel para a grade)
                            └─ /v1/notifications          (sino)
```

## Intuito (não negociável)

| É | Não é |
|---|--------|
| Front **client-only** consumindo a API universal | Backend Node/Prisma/NextAuth próprio |
| Deploy = **static export** zipado no hosting | `docker compose` / `prisma migrate` |
| Auth = **JWT Arara** (localStorage `arara_jwt`) | NextAuth/sessão de servidor |

> Este app nasceu de `leololato/hub-araratech@feature/hub-central` (fork completo do portal-suporte). Foi **enxugado** para só o Hub. O histórico do fork está no git. Ver [`docs/ADAPTACAO-MONOREPO.md`](./docs/ADAPTACAO-MONOREPO.md).

## Slug e URLs

| | |
|---|---|
| App slug (runtime/hosting) | `arara-hub` |
| API | `https://api.arara-tech.com` |
| UI (alvo) | `https://hub.arara-tech.com` |
| SSO (já no backend) | `/v1/r/arara-hub/sso/criar` + `/sso/trocar` |

## SSO handoff (como um card abre outro app)

1. Hub gera `id` (16 hex) + `verificador` (48 hex) no navegador.
2. `POST /v1/r/arara-hub/sso/criar { id, verificador, app_slug }` (com JWT) — guarda o JWT keyed pelo código, expira em 30s.
3. Redireciona para `https://<app>/#/sso?codigo=<id>.<verificador>`.
4. O app de destino faz `POST /v1/r/arara-hub/sso/trocar { codigo }` → recebe `{ token }`, guarda e entra.

**Cada app de destino precisa de uma rota `/sso`** que faça o passo 4. (O CRM já tem uma rota `/sso` de referência.)

## Dev

```bash
cp env.arara.example .env.local
npm install
npm run dev   # http://localhost:5180
```

## Release

```bash
ARARA_API_KEY=sk_live_... npm run export:deploy
```

## Pendente (ver docs/ADAPTACAO-MONOREPO.md)

- Grade por **AppMembership** (hoje é por papel).
- `/sso` nos apps de destino (suporte, horas, cursos) — CRM já tem.
- Registrar em `workspaces` do monorepo + workflow de deploy `apps/hub-araratech/**`.
- Hosting do slug `arara-hub` (hoje é API-only) + domínio `hub.arara-tech.com`.
