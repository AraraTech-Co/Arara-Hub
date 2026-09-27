# Plano — portar a árvore de atendimento para o motor de bot no portal (+ Meta)

Origem: `docs/mapa-fluxo-botconversa-atendimento-claude-testes.md` (árvore mapeada bloco a bloco).
Decisão: não instrumentar o BotConversa (teto = bot pausado na fase humana). O cérebro vira o
motor Claude no portal; o transporte é trocável (BotConversa hoje, Meta depois).

## O que já existe (fatia 1 do bot, entregue)

- `bot-orchestrator.service.ts` — laço de conversa (Haiku), portas de segurança, não fala por
  cima de humano.
- `whatsapp-transport.ts` — interface `WhatsAppTransport` + `BotConversaTransport` + factory
  (`WA_TRANSPORT`).
- `bot-tools.ts` — `consultar_status_chamado`, `escalar_para_humano`.
- Toggle global "Bot" (admin+), desligado por padrão.

## Track A — conhecimento da árvore no bot (transporte-agnóstico, construível já)

Objetivo: o bot conduz a triagem que o fluxo fazia (identificar área → identificar problema →
oferecer a solução conhecida → abrir chamado / escalar), sem árvore de botões rígida.

Fatias:

A1. **Política de triagem no system prompt.** Codificar as regras da árvore: três áreas
    (Suporte / Administrativo-Financeiro / Vendas), e no Suporte os erros de PDV conhecidos
    (NFC-e, retransmitir notas, atualizar PDV, login, caixa, tributação, NCM, BuscaPreço,
    etiquetas, SGI/SGC). Quando pedir print/foto, quando escalar, respeitar horário. Pura
    string — sem schema, sem dado. Transporte-agnóstico.

A2. **Ferramenta `buscar_solucao_conhecida`** (read-only) sobre a KB que o time já mantém
    (`KnowledgeArticle` — reusar, não criar 3ª KB; ver skill portal-suporte). O bot busca a
    solução e a repassa ao cliente em vez de inventar. Seed com as soluções enlatadas do fluxo
    (passos de atualização do PDV, reset de terminais BuscaPreço, etc.) — conteúdo revisado com
    o usuário antes de entrar.

A3. **Ferramenta `abrir_chamado`** (opcional) — o bot abre o ticket com `source='whatsapp'`
    reusando `createTicketFromConversation`, quando o problema não tem solução self-service.
    Hoje o ticket é aberto por gente; avaliar se o bot deve.

A4. **Horário de atendimento.** A árvore desviava por "Horário de Atendimento / Fechado". Ver
    se o portal já tem `business-hours` (existe controller) e o bot consulta para ajustar a
    mensagem (dentro/fora do horário).

## Track B — transporte escolhido: Avisa API (decisão 2026-07-20)

Descartados: instrumentar BotConversa (teto = bot pausado na fase humana) e Evolution
self-hosted (usuário preferiu serviço gerenciado). Escolhido **Avisa API**
(avisaapi.com.br) como transporte de curto prazo — encaixa como `AvisaTransport implements
WhatsAppTransport`, sem retrabalho no motor.

O que já se sabe (site + busca):
- Envio: `POST https://www.avisaapi.com.br/api/actions/sendMessage`, auth `Authorization: Bearer <token>`,
  params `number` + `message`.
- Planos flat, mensagens ilimitadas (R$ 69–199/mês) → forte indício de conexão **não-oficial (QR)**,
  mesmo perfil de risco de ban do BotConversa atual (usuário ciente e ok).
- Docs no Postman: https://www.postman.com/mw10/workspace/avisa-api/

### Contrato real lido na doc (Postman, 2026-07-20)
- Base é a instância Avisa; auth **Bearer Token** (`{{seutoken}}`) em todo request. Limite **240 req/min**.
- Conexão por **QR** (`Instance -> Get QR`; `Instance -> Instance Info` traz `LoggedIn`) → **não-oficial/Baileys** (endpoints de download trazem `MediaKey`/`FileEncSHA256`, artefatos do WhatsApp-web).
- Envio de texto: `POST /actions/sendMessage` body `{ "number", "message" }` (+ `id` opcional; reply via `contextInfo.StanzaId`/`Participant` — no reply, não mandar `id`).
- Outras ações: `sendMessageInternational`, `editMessage`, `markreadMessage`, `reactMessage` (tem flag `isFromMe`), `sendMedia` (fileUrl+type), `sendDocument` (base64), `sendPreview`, `sendLocation`, download de mídia por `MediaKey`.
- Webhook: `GET /webhook` (mostra) e `POST /webhook` (define; vazio desativa). **A doc NÃO descreve o payload de entrada nem confirma se entrega fromMe/outbound.**

### Ainda em aberto (não está na doc — confirmar antes de fechar)
1. **[GO/NO-GO] O webhook entrega mensagens ENVIADAS (fromMe)?** Não documentado. Expectativa técnica alta de SIM (Baileys emite `messages.upsert` com `key.fromMe=true`), mas **confirmar empírico** (apontar webhook pro portal e observar) ou com o suporte Avisa. Se não entregar → mesmo teto do BotConversa.
2. Formato exato do payload de entrada (mapear no `/api/webhooks/avisa`) — obter empírico/suporte.
3. Histórico de mensagens — não há endpoint óbvio; provável que comece do zero (igual BotConversa).

Plano: `AvisaTransport.sendText` já pode ser escrito (contrato de envio definitivo) + rota de
webhook `/api/webhooks/avisa` defensiva; env `WA_TRANSPORT=avisa` + `AVISA_API_TOKEN` (no VPS, nunca
no código). Confirmar o fromMe empírico num **chip reserva** antes do número real.

### IMPLEMENTADO (2026-07-22) — código da peça Avisa pronto (dormente)
Referência completa da API: `docs/avisa-api-dump-completo.md` (64 requests do export oficial) +
`docs/avisa-api-referencia.md`.
- `app/server/services/avisa-gateway.service.ts` — cliente HTTP (sendText/sendMedia por número,
  setWebhook, checkNumber, getAvatar, instanceStatus). Bearer token, base configurável.
- `app/server/services/transport/whatsapp-transport.ts` — `AvisaTransport` + factory por
  `WA_TRANSPORT` (botconversa|avisa|meta). Envio direto pelo número (sem subscriber_id).
- `app/server/controllers/avisa-webhook.controller.ts` + `app/api/webhooks/avisa/route.ts` —
  recebe ENTRADA e SAÍDA (fromMe). Parser defensivo (`normalizePayload`, exportado e testado) que
  cobre payloads estilo Baileys aninhado (`data.key`+`message.*`) e planos (`from`/`body`); loga só
  nomes de campos quando não reconhece (para confirmar o shape na 1ª msg real). Auth por
  `?token=AVISA_WEBHOOK_SECRET` (a Avisa não manda header de segredo). Fail-closed sem segredo.
- `inbound-message.service.ts` — `instance` opcional no evento (default botconversa) +
  **`mirrorOutbound`**: grava a mensagem ENVIADA pelo atendente (o furo que não existia) sem
  acionar o bot; dedup dupla (message_id + conteúdo recente) evita duplicar o eco do que o próprio
  portal enviou.
- `whatsapp.service.sendMessage` — envio do atendente agora passa pela **peça trocável**
  (`getWhatsAppTransport()`), não mais direto no BotConversa.
- `middleware.ts` + `config/access-control.json` — `/api/webhooks/avisa` público + rate-limit.
- `.env.example` — `AVISA_API_TOKEN`, `AVISA_API_URL`, `AVISA_WEBHOOK_SECRET`.

**Verificado:** tsc no baseline, eslint limpo, normalizer + persistência ponta-a-ponta verdes.

### CORREÇÃO do parser com o contrato REAL (2026-07-22) — via LeadSparkSDR
Analisando o repo `leadsparksdr` (PRDs Deco), achamos um **provider Avisa de produção**
(`supabase/functions/_shared/providers/avisa.ts`) que revelou que o parser inicial (chutado como
Baileys `data.key`) **erraria 100% das mensagens reais**. Corrigido:
- **`fromMe` CONFIRMADO** entregue pelo webhook (o provider faz `if (Info.IsFromMe) return null` —
  eles ignoram; nós espelhamos). O go/no-go do outbound está **resolvido**, sem teste empírico.
- Corpo real = `application/x-www-form-urlencoded` `jsonData=<JSON>&token=<t>` (não JSON puro);
  token no form ou na query. Shape do evento = `event.Info`/`event.Message` (whatsmeow).
- **Chave da conversa = `Info.Chat`** (o cliente, nos dois sentidos) — no outbound `Sender` é o
  atendente; usar Chat evita gravar na conversa errada.
- `canonicalPhone` (prefixa 55 em BR local) unificado entre envio e recepção; ignora `@broadcast`.
Contrato documentado em `docs/avisa-api-referencia.md`. Re-verificado com o payload real: 12/12 verde.
**Nada ativo até** `WA_TRANSPORT=avisa` + envs no VPS + webhook apontado.

### Padrões do LeadSparkSDR ainda por aproveitar (futuro, opcional)
Pipeline assíncrono com retry (inbound_events→process→outbound_events→retry) para resiliência;
contrato de provider mais rico (validate/createSession-QR/getStatus/ensureWebhook) p/ a tela de
conectar o número; `sdr-prompt`/`scoring`/`conversation-summary`/`followups` p/ o cérebro do bot (A2+).

## Track C — transporte Meta (durável, à prova de ban; quando quiser graduar)

Bloqueado na decisão de negócio de mover o número para a Cloud API (ver pitch). Quando liberar:

B1. `MetaTransport implements WhatsAppTransport` — `sendText` via Graph API (`/{phone_id}/messages`),
    `handoffToHuman` (sem pauseBot; no Meta o portal é o dono do canal).
B2. Webhook Meta — verificação (`hub.challenge`) + recepção de `messages` (inbound E status de
    entrega). Entra no mesmo `inbound-message.service` que já chama o orquestrador.
B3. Envs: `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_BUSINESS_PHONE_ID` (já esboçados no .env.example),
    verify token, app secret. `WA_TRANSPORT=meta` vira a chave.
B4. Cutover: número migra para Cloud API (o "celular original" deixa de receber — decisão do
    usuário). Portal passa a ver inbound + outbound nativamente.

## Decisões (2026-07-20)

- **A1 — feito.** Política de triagem no system prompt.
- **A4 — feito.** Contexto de horário de atendimento (dentro/fora do expediente), verificado.
- **A3 — decidido: bot só escala.** Reusa a estrutura atual: o bot põe na fila/avisa
  (`escalar_para_humano`) e o **operador abre o chamado pelo botão "criar ticket"**. Sem
  ferramenta `abrir_chamado`.
- **A2 — adiado** para o próximo ciclo. Depende de conteúdo revisado (rascunho em
  `docs/kb-solucoes-whatsapp-rascunho.md`) e de `OPENAI_API_KEY` (embeddings). Subir a
  ferramenta agora a deixaria dormente.

## Ordem sugerida (restante)

A2 (com revisão do conteúdo + KbArticles publicados) → Track B quando o número estiver pronto
para a Meta.

## Verificação

- `tsc --noEmit` no baseline (201), sem erros novos; eslint nos arquivos tocados.
- Banco real (Postgres container): conversa semeada, bot ligado + Claude/transporte mockados,
  conferir que a triagem escala/abre chamado nos ramos certos e fica calado nas portas de
  segurança — mesmo laço das fatias anteriores.
- Bot **nunca** ligado em produção sem autorização explícita (cliente real).
