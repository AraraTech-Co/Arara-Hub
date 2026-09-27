# Pauta para conversar com o Hefler — 09/09/2026

Estado conferido no código do monorepo hoje, não de memória.

---

## 1. Decisão que preciso dele — resposta do cliente no chamado

**Documento:** `mudanca-resposta-do-cliente-por-codigo.md` (vai junto).

`POST /tickets/public/reply` existe para o cliente **sem login** responder no
chamado dele, e hoje exige sessão do portal — que ele nunca tem. Foi engano meu
em 31/08, ao fechar o perímetro das 442 rotas. Está quebrada há nove dias.

A proposta não é só desfazer: o estado **anterior** ao engano também não
servia — bastava a chave de API do app (que vai no bundle, qualquer um lê) e um
`ticket_id` para escrever em qualquer chamado. A proposta é exigir **número do
chamado + código de 6**, a mesma prova de posse que a leitura já usa e que está
em produção funcionando.

| | prova de posse | tentativas | expira |
|---|---|---|---|
| antes de 31/08 | nenhuma | livre | não |
| hoje | sessão do portal (cliente não tem) | — | — |
| proposta | número + código | 5/hora por chamado | sim |

**Pergunta de processo, que é dele e sua, não minha:** quando o chamado está em
"Aguardando sua resposta" e o cliente responde, o status volta sozinho para
"Em atendimento"?

---

## 2. Pergunta que destrava o resto — onde as rotas do servidor vivem agora

Pelo que li em `packages/api/src`, a API registra rotas **estaticamente** do
TypeScript (`registerAllStaticApps()` → `routes.generated.ts`), e
`controller_code` só aparece na documentação. Se for isso:

- os ~30 scripts `.py` que editavam o controller no banco **não alcançam mais a
  produção** — é assim que trabalhamos os últimos meses;
- toda mudança de servidor passa a ser commit + `deploy-api`;
- `npm run codegen:routes` regenera o arquivo a partir de um export da
  produção — então uma edição feita à mão **some** se alguém rodar isso.

Preciso confirmar com ele antes de mexer em qualquer rota. É a resposta que
define como faço backend daqui pra frente.

---

## 3. Ainda pendentes (conferidos hoje, seguem abertos)

**`ctx.randomBytes`** — `pedido-hefler-aleatoriedade-sandbox.md` (28/08).
O sandbox expõe `app, body, fetch, files, headers, models, notify, params,
query, rawBody, reply, secrets, user`. Sem aleatoriedade. Os códigos de 6 são
gerados com `Math.random`, que no V8 é xorshift128+: quem coleta alguns calcula
os próximos. O bloqueio por tentativas cobre força bruta, não previsão.
**Se o item 1 for aprovado, isso deixa de ser melhoria e vira requisito** — o
par número+código passa a valer para ler *e* escrever.

**Agendador** — `pedido-hefler-agendador.md`. Não há cron nem scheduler em
`packages/api`. Sem isso não existe rotina automática do lado da plataforma.

**Stubs da integração** — `pedido-hefler-stubs-da-integracao.md`, 126 casos.
O pedido é um só: o gerador deve **falhar alto** (501) em vez de devolver um
CRUD genérico com 200. Foi um desses que criou os cards em branco no quadro —
`bulk-action` gravava um chamado novo em vez de aplicar a ação, e ninguém viu
porque a resposta era 200.

---

## 4. Mudou de natureza — `hub.arara-tech.com`

`pedido-hefler-dns-hub.md` pedia DNS + HTTPS. Hoje o endereço responde **502**:
502 é resposta HTTP, então DNS e TLS estão de pé. **O pedido está atendido; o
serviço atrás é que está fora.** Não cobrar o pedido antigo — avisar da queda.

---

## 5. Resolvido — pode sair da lista

`pedido-hefler-appmembership.md`. A API existe:
`GET /:slug/members`, `POST /:slug/members`, `DELETE /:slug/members/:userId`.

---

## 6. Operacional, não técnico

Ele é o **único** com a permissão `code_review`, e ela é obrigatória para tirar
qualquer card de "Em Revisão" no quadro do Dev — aprovando **ou** devolvendo.
Com três cards parados nessa coluna, a fila é de uma pessoa só. Conceder a
permissão a mais alguém é decisão do Leonardo, em Equipe › Membros.

---

## 7. Para ele saber, não para pedir

O snapshot de `apps/portal-suporte` no monorepo era de 28/08 e foi publicado em
produção ontem às 18:52, levando junto sete telas que já existiam
(Kanban Dev, Projetos, diagnóstico, entre outras) e o cabeçalho de sessão que o
próprio servidor do repositório exige em 442 rotas. Já corrigido — o front
agora vem da árvore que estava em produção.

Foi por isso que hoje saíram sete PRs seguidos. A maioria não era bug novo: era
coisa que voltou junto com aquele snapshot, ou costura que a troca de
hospedagem desfez.
