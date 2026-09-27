# Plano — motor de chatbot de atendimento no portal, com transporte trocável

Data: 2026-07-20
Decisão do usuário: construir o chatbot em **Claude**, ao lado do subsistema de IA OpenAI que
já existe (que continua fazendo triagem interna). Objetivo: sair do fluxo do BotConversa sem
refazer trabalho quando migrarmos o transporte para a Meta.

---

## 1. O modelo mental (a parte que evita retrabalho)

Três camadas, e só uma delas é descartável:

```
  Cliente no WhatsApp
        │
        ▼
  ┌─────────────┐   ← TRANSPORTE (a "peça" trocável)
  │ BotConversa │      hoje: BotConversa; amanhã: Meta Cloud API
  └─────────────┘      responsabilidade: entregar mensagem recebida / enviar resposta
        │
        ▼
  ┌───────────────────────────────────┐   ← MOTOR DE CONVERSA (código nosso, permanente)
  │  Portal — bot em Claude           │      decide: o bot responde? escala para humano?
  │  + ferramentas (tool use)         │      consulta o portal, responde, abre chamado
  └───────────────────────────────────┘
        │
        ▼
  ┌───────────────────────────────────┐   ← DADOS DO PORTAL (o que já existe)
  │ conversas, chamados, clientes, KB │
  └───────────────────────────────────┘
```

**O cérebro (motor + ferramentas) é código nosso e não muda quando a Meta entrar.** O que
troca é só o bloco de cima — o transporte. É isso que "trocar a peça" significa aqui.

O que **não** fazemos: reconstruir os ~40 blocos dentro do canvas do BotConversa. Aquilo seria
jogado fora no dia da Meta. A lógica de conversa nasce como código no portal.

---

## 2. O que já existe (reusar) vs. o que é novo

**Reusar (já pronto nesta base):**
- Webhook de entrada: `app/api/webhooks/whatsapp/route.ts` → `inbound-message.service.ts`
  (já grava a mensagem recebida, resolve CRM, cria/acha a conversa — corrigido na Fase 1).
- Gateway de saída: `botconversa-gateway.service.ts` (`sendText`, `getSubscriberByPhone`,
  `pauseBot`/`resumeBot`).
- Fila, atribuição, fases, `resolvedAt`, eventos de funil (Sprints 2–5).
- Abertura de chamado a partir da conversa (janela nova, com solicitante/responsável/origem).
- Base de conhecimento e embeddings do subsistema OpenAI (`app/lib/ai/embeddings.ts`,
  `learn-from-history.ts`) — o bot Claude pode **consultar** isso via ferramenta, sem depender
  do LLM da OpenAI.

**Novo:**
- SDK do Claude (`@anthropic-ai/sdk`) + um cliente próprio, separado do `llm-client.ts` da
  OpenAI (que fica para a triagem interna).
- A camada de **transporte** abstrata (interface + duas implementações).
- O **motor de conversa** (o laço: recebe → decide → responde/escala).
- As **ferramentas** que o bot pode chamar (consultar chamado, buscar cliente, abrir chamado,
  escalar para humano).
- Um **liga/desliga do bot por conversa e global** (admin), no espírito do toggle de rodízio.

---

## 3. A camada de transporte (o que torna a peça trocável)

Uma interface só, com duas implementações. O motor fala com a interface e nunca sabe quem é o
transporte por baixo.

```ts
// app/server/services/transport/whatsapp-transport.ts
export interface WhatsAppTransport {
  /** Envia texto para um contato (resolve o id interno do provedor). */
  sendText(conversationId: string, text: string): Promise<{ ok: boolean }>
  /** Pausa o bot do provedor quando um humano assume (no-op se não existir). */
  handoffToHuman(conversationId: string): Promise<void>
  /** Nome do transporte, para logs e métricas. */
  readonly name: 'botconversa' | 'meta'
}
```

- `BotConversaTransport` — embrulha o `botconversa-gateway.service.ts` que já existe. É o
  transporte de hoje.
- `MetaTransport` — implementado no spike da Meta (webhook + Graph API de envio). É a peça nova.

O webhook de entrada também vira transporte-agnóstico: normaliza o payload (BotConversa hoje,
Meta amanhã) para um formato interno único antes de chamar o motor. Já temos metade disso — o
`inbound-message.service.ts` só precisa deixar de assumir o shape do BotConversa.

**Resultado:** migrar para a Meta = escrever `MetaTransport` + o adaptador de webhook dela, e
trocar uma variável (`WA_TRANSPORT=meta`). O motor, as ferramentas e o histórico não mudam.

---

## 4. O motor de conversa

Fica **entre** o webhook e o gateway. Hoje a mensagem recebida vira registro e para; o motor
adiciona o passo "o bot deveria responder isto?".

Fluxo por mensagem recebida (só quando o bot está ligado para a conversa):

1. Mensagem entra pelo webhook → vira `WhatsAppMessage` (já acontece).
2. Se a conversa tem atendente humano ativo, ou o bot está desligado → **não faz nada** (a
   pessoa atende). O bot nunca fala por cima de um humano.
3. Senão, monta o contexto: histórico da conversa + system prompt de atendimento + as
   ferramentas disponíveis, e chama o Claude (via Tool Runner do SDK — ele roda o laço de
   ferramenta sozinho).
4. O Claude ou **responde** (texto → grava como mensagem `fromMe`, marca `Automação`/`Bot`,
   envia pelo transporte), ou **decide escalar** (chama a ferramenta `escalar_para_humano`).
5. Ao escalar: a conversa entra na fila e a equipe é avisada — reusa o caminho de fila/rodízio
   que já existe.

Ponto de plugue no código: um `bot-orchestrator.service.ts` novo, chamado por
`inbound-message.service.ts` depois de gravar a mensagem. Não é um cron — é inline, na hora.

Modelos:
- **Haiku 4.5** (`claude-haiku-4-5`) para o volume: classificar intenção, responder pergunta
  simples, decidir se sabe ou não sabe. Barato por mensagem — importa quando é cliente real o
  dia todo.
- **Opus 4.8** (`claude-opus-4-8`) para o caso difícil: quando a resposta exige raciocínio
  sobre o chamado, ou quando o Haiku sinaliza baixa confiança. Escalar de modelo, não direto
  para humano, quando dá.

Guardrails no system prompt (é cliente real, então isto é obrigatório, não opcional):
- O bot **não promete prazo, valor, nem resolução** que ele não pode garantir.
- Na dúvida, escala para humano em vez de inventar.
- Assina como bot/automação — o cliente sabe que não é humano (e a assinatura já existe no
  composer).

---

## 5. As ferramentas do bot (tool use)

É isto que faz o bot deixar de ser papagaio e virar atendente da Arara. Cada ferramenta é uma
função nossa que o Claude decide chamar; o resultado volta para ele e ele continua.

Mínimo para começar (ordem de implementação):
1. `consultar_status_chamado(telefone | numero_chamado)` — lê do portal, responde o status.
2. `buscar_cliente(telefone)` — resolve empresa/contato pelo CRM (já existe a resolução).
3. `escalar_para_humano(motivo)` — coloca na fila + avisa a equipe. É a saída de segurança.
4. `abrir_chamado(titulo, descricao)` — reusa `createTicketFromConversation` (já pronto).
5. `buscar_na_base_de_conhecimento(pergunta)` — consulta a KB/embeddings que já existem.

Todas passam por Zod na fronteira e só leem/escrevem o que a conversa autoriza (o telefone da
conversa, não um telefone arbitrário que o modelo invente).

---

## 6. Liga/desliga e convivência com humano

- **Toggle global do bot** (admin), no espírito do toggle de rodízio: liga/desliga o
  atendimento automático de uma vez.
- **Por conversa**: assim que um humano clica "Atender", o bot cala naquela conversa (e o
  `handoffToHuman` pausa o bot do transporte). Quando resolve/fecha, pode reabrir para o bot.
- **Nunca simultâneo**: a regra do passo 2 do motor garante que bot e humano não falam juntos.

Isso mantém a virada que você já definiu: começa conservador (bot desligado por padrão),
liga um fluxo de cada vez.

---

## 7. Ordem de migração — menu a menu, não big bang

Não desligamos o BotConversa de uma vez. Migramos um caminho do fluxo por vez:

1. Escolhe **um** ramo simples do fluxo atual (ex.: "consultar status").
2. O motor passa a atender aquele ramo no portal.
3. Desliga só aquele bloco no BotConversa (a cópia primeiro, depois produção).
4. Testa em produção com risco pequeno — é um ramo, não o fluxo todo.
5. Repete para o próximo ramo.

O mapeamento do fluxo (a trilha 1 que combinamos, via Chrome) vira a lista de ramos a migrar,
em ordem de simplicidade.

---

## 8. Primeira fatia vertical (o que eu construo primeiro)

Um caso de ponta a ponta, para provar o encanamento antes de reconstruir o fluxo inteiro:

**"Cliente pergunta o status do chamado, o bot responde."**

- SDK do Claude + cliente próprio + env var (`ANTHROPIC_API_KEY`).
- `WhatsAppTransport` com a implementação BotConversa (embrulhando o gateway atual).
- `bot-orchestrator.service.ts` com o laço mínimo + a regra "não fala por cima de humano".
- Uma ferramenta: `consultar_status_chamado`.
- Toggle global do bot (desligado por padrão).

Verificação: contra Postgres real, simulo uma conversa com um chamado vinculado, mando
"e o meu chamado?", e confirmo que o bot consulta o status certo, grava a resposta como
`fromMe`, e que ela sairia pelo transporte. Com o toggle desligado, nada acontece. Com um
humano atribuído, o bot fica calado.

Isso é pequeno, reversível (toggle desligado), e exercita as três camadas de uma vez.

---

## 9. Custo

Cobrança por mensagem/token. Haiku 4.5 é barato ($1/$5 por milhão de tokens de entrada/saída);
uma resposta curta de atendimento custa frações de centavo. Opus 4.8 só nos casos difíceis.
Guardrails de custo: limite de tokens por resposta, e o bot escala para humano em vez de
entrar em loop. Dá para instrumentar o gasto por conversa desde o começo (as métricas de
WhatsApp já existem).

---

## 10. Fora de escopo desta fase

- **A conexão com a Meta em si.** É a trilha de transporte, separada — spike próprio (número
  de teste, verificação de negócio, aprovação de template). O motor não espera por ela.
- **Reconstruir o fluxo inteiro de 40 blocos.** Fazemos ramo a ramo (seção 7), não tudo agora.
- **Trocar o subsistema OpenAI interno.** A triagem/embeddings da OpenAI continua onde está;
  o bot Claude só consulta a KB.
- **Templates da Meta (mensagem ativa fora da janela de 24h).** Só entra quando a Meta entrar.

---

## 11. Riscos e o que preciso de você

- **É cliente real.** O maior risco é o bot dizer algo errado a um cliente. Mitigação: toggle
  desligado por padrão, guardrails no prompt, escalar na dúvida, e migrar um ramo pequeno por
  vez com você acompanhando.
- **Decisão sua antes de ligar em produção**: o bot vai falar com cliente. Não ligo o toggle
  global sem você dizer "pode", por ramo.
- **Depende do cron do worker no VPS** para os caminhos assíncronos (o mesmo pendente das
  fases anteriores) — mas a primeira fatia é inline, não depende disso.

---

## Sequência sugerida

1. Fatia vertical da seção 8 (motor + transporte + 1 ferramenta + toggle). — próximo passo
2. Mapear o fluxo da cópia via Chrome → lista de ramos a migrar (trilha 1).
3. Migrar ramo a ramo (seção 7), cada um com verificação em produção.
4. Em paralelo, quando você quiser: spike da Meta (transporte novo), sem tocar no motor.
