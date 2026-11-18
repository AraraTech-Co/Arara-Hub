# Central de Gestão (`central-gestao`)

SPA Vite + React. Entrada só pelo Hub (`/sso/?c=…`); chama `/v1/r/central-gestao/*`
só com o JWT da pessoa. Fatia 1: Kanban da gestão (4 colunas, filtros, histórico,
arquivar/restaurar, conflito por versão, criação sem duplicar).

## Local

```bash
cp .env.example .env
npm install
npm run dev
```

`npm run build` roda `tsc --noEmit` antes do `vite build`.

## Backend

- Fonte legível: `packages/api/scripts/central-gestao/` (`_comum.js` + um arquivo por rota).
- Gerado: `packages/api/src/apps/central-gestao/routes.generated.ts`, escrito por
  `node packages/api/scripts/central-gestao/gerar-rotas.mjs` (só este arquivo; não é o codegen geral).
- Models: `packages/api/scripts/central-gestao/models.json` (`Profile`, `Cartao`, `CartaoEvento`).
- Testes: `node --test packages/api/scripts/central-gestao/testes/*.test.mjs`
- Mutação: `node packages/api/scripts/central-gestao/testes/mutacao.mjs`

## Para ir ao ar (fora deste diretório)

Registrar o app e os models, criar `Profile` + membership de cada pessoa, DNS/nginx/porta,
e então o serviço em `deploy/frontends.compose.yml`, o workflow de deploy e o card no Hub.
