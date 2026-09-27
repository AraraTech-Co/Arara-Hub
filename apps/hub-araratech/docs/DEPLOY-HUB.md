# Deploy do Arara Hub — passos (produção = Leonardo)

O front do Hub usa **o mesmo modelo container dos outros fronts** (`deploy/Dockerfile.next-export` → nginx numa porta do host; o Nginx do VPS mapeia o domínio → porta). O app já está pronto pra isso: tem `package-lock.json` próprio, `next.config.export.mjs` e `npm run build → out/` (validado).

> ⚠️ **Por que eu (Claude) não apliquei isto sozinho:** editar `deploy/frontends.compose.yml` ou `deploy/nginx/**` **dispara o deploy de TODOS os fronts** (os workflows `deploy-portal-*` observam esses caminhos). Deploy em produção é decisão do Leonardo. Então deixei o **workflow pronto (manual)** e este passo-a-passo.

## O que já está pronto (commitado)
- `apps/hub-araratech/` — app client-only (build verde, grade por membership).
- `.github/workflows/deploy-hub-araratech.yml` — **manual (`workflow_dispatch`)**; gatilho de `push` comentado.
- Backend SSO `arara-hub` (`/sso/criar` + `/sso/trocar`) **já existe** em `packages/api/src/apps/arara-hub` — nada a fazer na API.

## Passo 1 — Serviço no compose (dispara deploy em massa: faça consciente)
Adicionar em `deploy/frontends.compose.yml` (porta 10009 livre):

```yaml
  hub-araratech:
    image: arara-front-hub-araratech:local
    build:
      context: ..
      dockerfile: deploy/Dockerfile.next-export
      args:
        APP_DIR: apps/hub-araratech
        NEXT_PUBLIC_ARARA_APP_SLUG: arara-hub
        NEXT_PUBLIC_ARARA_API_URL: https://api.arara-tech.com
    container_name: arara-front-hub-araratech
    restart: unless-stopped
    environment:
      <<: *front-env
    ports:
      - "10009:80"
    networks:
      - arara
```

## Passo 2 — Nginx do VPS (fora deste repo)
No Nginx do host, `server` para `hub.arara-tech.com` → `proxy_pass http://127.0.0.1:10009;` (espelhar o bloco de `crm.arara-tech.com`, que aponta pra 10001). TLS pelo mesmo certbot dos outros.

## Passo 3 — DNS
Registro **A** `hub.arara-tech.com` → IP do VPS (mesmo dos outros fronts).

## Passo 4 — Ligar o gatilho e deployar
- Descomentar o bloco `push:` em `.github/workflows/deploy-hub-araratech.yml` (opcional, pra deploy automático em `master`).
- Rodar o deploy: **Actions → Deploy hub-araratech → Run workflow** (ou `gh workflow run deploy-hub-araratech.yml`). O workflow faz rsync de `apps/hub-araratech/` + `deploy/`, builda e sobe o container, e faz smoke em `https://hub.arara-tech.com/`.

## Alternativa (hosting da plataforma, sem container)
Se preferir o modelo static-export-no-hosting (como no `export:deploy`):
```bash
cd apps/hub-araratech
ARARA_API_KEY=sk_live_... npm run export:deploy   # POST /v1/apps/arara-hub/hosting
```
Requer o slug `arara-hub` habilitado pra hosting (hoje é API-only). Escolher **um** dos dois modelos, não os dois.

## Ainda pendente (Fase 3) — SSO nos apps de destino
Pro "entra já logado" funcionar de verdade, cada app destino precisa de uma rota `/sso` que troque o código em `POST /v1/r/arara-hub/sso/trocar` e guarde o token. O **CRM já tem** `/sso` de referência; falta suporte/horas/cursos/araratech.
