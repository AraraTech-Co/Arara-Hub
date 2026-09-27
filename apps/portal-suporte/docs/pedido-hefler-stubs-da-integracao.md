# Controllers que ainda são o esqueleto da integração

**Para:** Hefler
**De:** Portal de Suporte · 08/09/2026

## O resumo

Varri as **489 rotas publicadas** do `portal-suporte` e encontrei **126** cujo
controller continua sendo o esqueleto gerado na migração das rotas do Next para
módulos da plataforma.

Isso não é reclamação sobre o gerador — ele fez o trabalho pesado, e implementar
o miolo era nosso. O problema é que parte desses esqueletos **responde 200 sem
fazer nada**, e isso é pior do que responder erro.

## O caso que nos custou caro

`POST /tickets/bulk-action` era assim:

```js
const body = Object.assign({}, ctx.body || {});
const row = await model.create(body);
return ctx.reply.status(201).send(row);
```

A tela manda `{ ids, action, ...extra }` para aplicar uma ação em vários
chamados. O controller pegava esse corpo e **criava um chamado** com os campos
`ids` (um array) e `action` (um texto).

No quadro: chamado sem título vira card em branco, e sem status o Kanban o joga
em Backlog. O Backlog foi de 8 para 30 cards vazios sem ninguém abrir chamado.

E o pior: **a tela dizia "N tickets atualizados"**, porque conta o que enviou,
não o que o servidor fez. Arquivar, atribuir e mudar prioridade em lote nunca
funcionaram — por semanas — e não havia como perceber. Descobrimos pelo efeito
colateral, não pelo erro.

Essa rota já corrigimos do nosso lado.

## O que a varredura procura

| assinatura | o que é | risco |
|---|---|---|
| **VERBO** | o caminho termina em ação (`/approve`, `/complete`, `/execute`) mas o corpo é CRUD genérico | **alto** — responde 200 e não faz nada |
| **501** | o esqueleto que se declara não implementado | baixo — ao menos avisa |
| **MODELO** | CRUD genérico lendo model sem relação com o caminho (`GET /uptime` devolvendo lista de `Ticket`) | médio — devolve dado errado |

O script é `scripts/varredura-stubs.py`, no repositório do portal, e roda a
qualquer momento.

## 1. Caminho é ação, corpo é CRUD genérico — 15 rotas

São as que preocupam: respondem sucesso e não executam a ação do nome.

| módulo | método | rota |
|---|---|---|
| `admin_ai` | `POST` | `/admin/ai/knowledge/embed-all` |
| `admin_ai` | `GET` | `/admin/ai/train` |
| `admin_ai` | `GET` | `/admin/ai/knowledge/embed-all` |
| `admin_impersonate` | `GET` | `/admin/impersonate` |
| `admin_ssh_servers` | `POST` | `/admin/ssh-servers/execute` |
| `change_requests` | `POST` | `/change-requests/:id/approve` |
| `change_requests` | `POST` | `/change-requests/:id/schedule` |
| `change_requests` | `POST` | `/change-requests/:id/complete` |
| `change_requests` | `POST` | `/change-requests/:id/fail` |
| `change_requests` | `POST` | `/change-requests/:id/reject` |
| `change_requests` | `POST` | `/change-requests/:id/start` |
| `change_requests` | `POST` | `/change-requests/:id/submit` |
| `search` | `GET` | `/search/sync` |
| `tasks` | `POST` | `/tasks/:id/assign` |
| `tasks` | `POST` | `/tasks/:id/complete` |

**Três já estão ligadas a uma tela nossa** — alguém clica hoje e nada acontece:
`/change-requests` (gestão de mudanças), `/admin/ai/train` (painel de
aprendizado) e `/admin/impersonate` (entrar como outro usuário; esse é o mais
sensível, porque envolve identidade).

## 2. Declaram-se não implementadas (501) — 53 rotas

Estas são honestas: falham dizendo que falharam.

Vale uma decisão sua. **Rota que existe e devolve 501 convida alguém a construir
em cima** presumindo que um dia funcionou. Se não vão existir, apagar é melhor
que deixar.

Boa parte é do módulo `auth` — e essas talvez nem devessem existir, já que o
portal usa `/v1/auth/*` da plataforma, não o runtime do app.

<details><summary>lista completa</summary>

| módulo | método | rota |
|---|---|---|
| `admin_ai` | `POST` | `/admin/ai/routing-rules` |
| `admin_ai` | `POST` | `/admin/ai/fine-tune` |
| `admin_ai` | `POST` | `/admin/ai/skills` |
| `admin_ai` | `POST` | `/admin/ai/train` |
| `admin_ai` | `POST` | `/admin/ai/triage` |
| `admin_ai` | `POST` | `/admin/ai/agents` |
| `admin_ai` | `POST` | `/admin/ai/playbooks` |
| `admin_companies` | `POST` | `/admin/companies/:id/health-score` |
| `admin_impersonate` | `POST` | `/admin/impersonate` |
| `admin_import_trello` | `POST` | `/admin/import-trello` |
| `admin_import_trello_historico` | `POST` | `/admin/import-trello-historico` |
| `ai` | `POST` | `/ai/feedback` |
| `ai` | `POST` | `/ai/chat` |
| `auth` | `POST` | `/auth/change-password` |
| `auth` | `POST` | `/auth/forgot-password` |
| `auth` | `POST` | `/auth/login` |
| `auth` | `POST` | `/auth/magic-link` |
| `auth` | `POST` | `/auth/reset-password` |
| `auth` | `POST` | `/auth/signout` |
| `auth` | `POST` | `/auth/register` |
| `auth` | `POST` | `/auth/reset-with-code` |
| `cache` | `POST` | `/cache` |
| `cron` | `POST` | `/cron/worker` |
| `cron` | `POST` | `/cron/sla-check` |
| `devops` | `POST` | `/devops/:serverId/files/execute` |
| `devops` | `POST` | `/devops/:serverId/containers/:ref/restart` |
| `devops` | `POST` | `/devops/:serverId/containers/:ref/stop` |
| `devops` | `POST` | `/devops/:serverId/docker-restart` |
| `devops` | `POST` | `/devops/:serverId/files/create` |
| `devops` | `POST` | `/devops/:serverId/files/delete` |
| `devops` | `POST` | `/devops/:serverId/files/rename` |
| `devops` | `POST` | `/devops/:serverId/files/write` |
| `devops` | `POST` | `/devops/:serverId/reboot` |
| `devops` | `POST` | `/devops/connect` |
| `devops` | `POST` | `/devops/:serverId/containers/:ref/start` |
| `file_explorer` | `POST` | `/file-explorer/create` |
| `file_explorer` | `POST` | `/file-explorer/delete` |
| `file_explorer` | `POST` | `/file-explorer/write` |
| `file_explorer` | `POST` | `/file-explorer/execute` |
| `file_explorer` | `POST` | `/file-explorer/move` |
| `file_explorer` | `POST` | `/file-explorer/rename` |
| `filters` | `POST` | `/filters` |
| `integrations` | `POST` | `/integrations/:name/test` |
| `integrations` | `POST` | `/integrations/:name/disable` |
| `integrations` | `POST` | `/integrations/:name/enable` |
| `integrations` | `POST` | `/integrations/discord/send-alert` |
| `invites` | `POST` | `/invites` |
| `productivity` | `POST` | `/productivity/status` |
| `search` | `POST` | `/search/sync` |
| `sla` | `POST` | `/sla/tracking/:ticketId/pause` |
| `sla` | `POST` | `/sla/configs` |
| `sla` | `POST` | `/sla/tracking/:ticketId` |
| `upload` | `POST` | `/upload` |

</details>

## 3. CRUD genérico com model sem relação — 58 rotas

Devolvem dado, mas o dado errado. `GET /uptime` devolvendo a lista de chamados é
o exemplo mais claro.

Muitas são leitura que ninguém consome, então o impacto é menor — mas convém
saber que existem.

<details><summary>lista completa</summary>

| módulo | método | rota |
|---|---|---|
| `admin_ai` | `GET` | `/admin/ai/agents` |
| `admin_ai` | `GET` | `/admin/ai/fine-tune` |
| `admin_ai` | `GET` | `/admin/ai/skills` |
| `admin_ai` | `GET` | `/admin/ai/faq-candidates` |
| `admin_ai` | `GET` | `/admin/ai/knowledge` |
| `admin_ai` | `GET` | `/admin/ai/knowledge-gaps` |
| `admin_ai` | `GET` | `/admin/ai/playbooks` |
| `admin_ai` | `GET` | `/admin/ai/routing-rules` |
| `admin_ai` | `GET` | `/admin/ai/stats` |
| `admin_audit` | `GET` | `/admin/audit` |
| `admin_automation` | `GET` | `/admin/automation` |
| `admin_companies` | `GET` | `/admin/companies/:id/health-score` |
| `admin_companies` | `GET` | `/admin/companies/:id/units/:unitId/caixas` |
| `admin_companies` | `GET` | `/admin/companies/:id/units/:unitId/whatsapps` |
| `admin_companies` | `GET` | `/admin/companies/:id/contacts` |
| `admin_companies` | `GET` | `/admin/companies/groups` |
| `admin_feed` | `GET` | `/admin/feed` |
| `admin_incidents` | `GET` | `/admin/incidents` |
| `admin_operational_alerts` | `GET` | `/admin/operational-alerts` |
| `admin_permissions` | `GET` | `/admin/permissions` |
| `admin_sla_calendar` | `GET` | `/admin/sla-calendar` |
| `admin_sla_contracts` | `GET` | `/admin/sla-contracts` |
| `admin_teams` | `GET` | `/admin/teams` |
| `admin_trello_historico` | `GET` | `/admin/trello-historico` |
| `admin_view_as` | `GET` | `/admin/view-as` |
| `auth` | `GET` | `/auth/magic-link` |
| `auth` | `GET` | `/auth/me` |
| `cache` | `GET` | `/cache` |
| `cron` | `GET` | `/cron/sla-check` |
| `devops` | `GET` | `/devops/:serverId/containers/:ref/logs` |
| `devops` | `GET` | `/devops/:serverId/containers/:ref/stats` |
| `devops` | `GET` | `/devops/:serverId/crontab` |
| `devops` | `GET` | `/devops/:serverId/files/read` |
| `devops` | `GET` | `/devops/:serverId/logs-analysis` |
| `devops` | `GET` | `/devops/:serverId/ssl` |
| `devops` | `GET` | `/devops/:serverId/containers` |
| `devops` | `GET` | `/devops/:serverId/files/list` |
| `devops` | `GET` | `/devops/:serverId/metrics` |
| `devops` | `GET` | `/devops/:serverId/processes` |
| `devops` | `GET` | `/devops/ping-all` |
| `external` | `GET` | `/external/tickets/:id/attachments` |
| `external` | `GET` | `/external/tickets/:id/messages` |
| `external` | `GET` | `/external/tickets/:id/stream` |
| `external` | `GET` | `/external/tickets` |
| `file_explorer` | `GET` | `/file-explorer/read` |
| `file_explorer` | `GET` | `/file-explorer/list` |
| `filters` | `GET` | `/filters` |
| `health` | `GET` | `/health` |
| `integrations` | `GET` | `/integrations/errors` |
| `integrations` | `GET` | `/integrations/:name/stats` |
| `integrations` | `GET` | `/integrations/dashboard` |
| `integrations` | `GET` | `/integrations` |
| `invites` | `GET` | `/invites` |
| `productivity` | `GET` | `/productivity/sessions` |
| `productivity` | `GET` | `/productivity/status` |
| `search` | `GET` | `/search` |
| `uptime` | `GET` | `/uptime` |
| `webhooks` | `GET` | `/webhooks/whatsapp` |

</details>

## O que eu pediria

**Não é para implementar 126 rotas.** A maioria ninguém usa, e implementar sem
demanda é trabalho jogado fora.

Em ordem de utilidade:

1. **Que o esqueleto gerado falhe alto, não baixo.** Se o gerador não sabe o que
   a rota faz, `501` é a resposta certa — nunca um CRUD genérico que responde
   200. Foi o 200 que escondeu o problema por semanas, não a falta de
   implementação.

2. **Uma marca no código gerado** — algo como `// GERADO AUTOMATICAMENTE — NÃO
   IMPLEMENTADO`. Aí qualquer varredura acha, inclusive a sua, e sem heurística.

3. **Sua leitura sobre as 53 de 501**: quais valem ser apagadas em vez de
   mantidas.

O item 1 é o que impede o próximo caso. Os outros dois são limpeza.
