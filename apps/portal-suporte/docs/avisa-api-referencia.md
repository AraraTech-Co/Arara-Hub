# Avisa API — notas de integração (portal-suporte)

**Fonte da verdade:** `docs/avisa-api-dump-completo.md` (gerado do export oficial
`docs/Avisa API.postman_collection.json`, 64 requests com corpos reais). Este arquivo é só o
resumo do que importa pra nós.

Comum a tudo: **`Authorization: Bearer {{seutoken}}`**, base `{{baseurl}}`, **240 req/min**,
conexão **QR** (não-oficial/Baileys). Números vão como `55DDDNUMERO` (JID `...@s.whatsapp.net`
em alguns endpoints; grupo `...@g.us`).

## Endpoints que o portal vai usar

- **Enviar texto** — `POST /actions/sendMessage` — `{ number, message }`. Reply: incluir
  `contextInfo.StanzaId` + `Participant` (e **não** enviar `id`). → é o `AvisaTransport.sendText`.
- **Enviar mídia** — `POST /actions/sendMedia` — `{ number, fileUrl, message, type: image|video|audio|document, fileName }`.
- **Configurar webhook** — `POST /webhook` — `{ "webhook": "https://portal/api/webhooks/avisa" }`
  (string vazia remove). Ver o atual: `GET /webhook`.
- **Validar número** — `POST /actions/checknumber` — `{ number }` (tem WhatsApp?). Internacional:
  `/actions/checknumberinternational`.
- **Marcar como lida** — `POST /actions/markreadMessage` — `{ sender, chat, id: [...] }`.
- **Reagir** — `POST /actions/reactMessage` — `{ number, react, id, isFromMe, participant }`.
- **Apagar/editar** — `POST /actions/deleteMessage` `{ number, id }` · `POST /actions/editMessage`.
- **Presença** — `POST /chat/typing/start|stop` · `POST /chat/recording/start|stop` — `{ chat }`.
- **Etiquetas** (↔ nosso WATag) — `POST /label/chat` `{ jid, labelId }` · `POST /unlabel/chat`.
- **Avatar** (foto de perfil, que o BotConversa não dava) — `POST /user/avatar` `{ number, preview }`.
- **Conexão/instância** — `GET /instance/qr` (QR) · `GET /instance/status` (param `LoggedIn`) ·
  `DELETE /instance/user` (desconecta).

## Também existe (fora do escopo imediato)

Grupos (`/group/*`: list, info, create, update, name, description, adminonly, photo, e envio
`/actions/sendMessageGroup`), mensagens interativas (`/actions/sendList`, `/actions/template`,
`/actions/buttons`, `/actions/mediabutton`, `/actions/carouselmedia`, `/buttons/pix`,
`/actions/locationButton`), envio assíncrono (`/actions/sendMessageAsync` + `getSendMessageAsync?id=`),
status/story (`/status/image`), catálogo (`/business/catalog/*`), comunidades (`/community/*`),
contatos (`/contact/add|remove`, `/user/contacts`, `/user/parselid`), arquivar/timer de conversa
(`/chat/archive`, `/chat/disappearing-timer`). Corpos completos no dump.

## Contrato do WEBHOOK (RESOLVIDO — via provider Avisa de produção do LeadSparkSDR)

A doc da Avisa só documenta como **apontar** o webhook (`POST /webhook { webhook: url }`), não o
payload de entrada. O contrato abaixo veio de um provider Avisa **rodando em produção**
(`leadsparksdr/.../providers/avisa.ts`), então é confiável — não é mais suposição.

- **`fromMe` É entregue** ✅ — o webhook manda as mensagens ENVIADAS (`Info.IsFromMe:true`), não só
  as recebidas. Resolve o teto do BotConversa (o go/no-go que faltava).
- **Corpo:** `Content-Type: application/x-www-form-urlencoded`, no formato
  `jsonData=<JSON url-encoded>&token=<segredo>` — **não é JSON puro**. O token de segurança vem
  no **form** (`token`) ou na query (`?token=`).
- **Shape do evento** (whatsmeow): `{ event: { Info, Message, type } }`
  - `Info`: `IsFromMe`, `Chat` (jid da conversa), `Sender`/`SenderAlt` (quem enviou; SenderAlt é o
    telefone real quando `@s.whatsapp.net`), `PushName`, `ID`, `IsGroup`, `GroupName`.
  - `Message`: `conversation` | `extendedTextMessage.text` | `imageMessage.caption` (e vídeo/doc).
  - **Chave da conversa em 1:1 = `Info.Chat`** (é sempre o cliente, nos dois sentidos). No outbound,
    `Sender` é o número do atendente — usar `Chat` evita gravar a saída na conversa errada.
  - Ignorar `@broadcast`/`status@broadcast`. Números BR locais ganham `55` (`canonicalPhone`).

Tudo isso já está implementado e testado em `avisa-webhook.controller.ts` (`normalizePayload`).
