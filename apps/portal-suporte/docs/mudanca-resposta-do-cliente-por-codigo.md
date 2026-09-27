# Resposta do cliente no chamado: trocar sessão do portal por número + código

**Para avaliação do Hefler.** Escrito em 09/09/2026.
Mudança em `packages/api/src/apps/portal-suporte/routes.generated.ts`, rota
`POST /tickets/public/reply`.

---

## Resumo em uma frase

A rota que existe para o cliente **sem login** responder no chamado dele hoje
exige sessão do portal — e por isso não funciona. A proposta é trocar essa
exigência pela mesma prova de posse que a leitura já usa: **número do chamado
+ código de 6 caracteres**.

---

## Como está hoje

```
POST /tickets/public/reply
authMode: actor
guarda:   _gsComSessao   ← exige sessão do portal
corpo:    { ticket_id, message, name?, email? }
```

O handler cria uma `TicketMessage` com `guest_name` / `guest_email`.

**Dois problemas, em momentos diferentes:**

**Antes de 31/08 — aberta demais.** Bastava a chave de API do app (que vai no
bundle do front, ou seja, qualquer pessoa consegue) e um `ticket_id` para
escrever em **qualquer** chamado. Nenhuma prova de que quem escreve tem relação
com aquele chamado.

**Depois de 31/08 — fechada demais.** Na varredura que passou a exigir sessão
do portal em 442 rotas, esta entrou junto. Foi engano meu: é justamente a rota
de quem não tem login. O visitante não tem sessão, então recebe
`401 Requer sessão do portal`. Está assim há nove dias.

Auditei as demais rotas públicas do módulo — `GET /tickets/public`,
`POST /tickets/acompanhar`, `external/*`, `/auth/senha/*`. Nenhuma outra foi
atingida; só esta e uma rota de diagnóstico, que deve mesmo estar guardada.

---

## O que se propõe

```
POST /tickets/public/reply
authMode: webhook_secret          (segredo `portal_publico_token`)
guarda:   nenhuma
corpo:    { numero, codigo, mensagem }
```

A validação é **a mesma** de `POST /tickets/acompanhar`, que já está em
produção e funcionando:

| regra | comportamento |
|---|---|
| normalização | maiúsculas, só `A-Z0-9`, `O→0`, `I/L→1` |
| código | exatamente 6 caracteres |
| tentativas | 5 erros travam **o chamado** por 1 hora (`acomp_bloqueado_ate`) |
| recusa | frase única — não diz se errou o número ou o código |
| teto | `acomp_expira_em` (1 ano, gravado na criação) |
| validade real | enquanto aberto, mais 7 dias depois de encerrado |

Em caso de sucesso, cria a mensagem como hoje (`guest_name` / `guest_email`
vindos do próprio chamado, não do corpo — o cliente não escolhe quem ele diz
ser).

---

## Um detalhe que morde se passar batido

A mensagem criada precisa gravar **`is_internal: false` explicitamente**.

A leitura em `/tickets/acompanhar` filtra assim:

```js
// `is_internal` verdadeiro OU indefinido fica de fora: mensagem sem a
// marca é tratada como interna. Na dúvida, esconder.
if (m.is_internal !== false) continue;
```

É uma escolha defensiva correta — mas significa que uma mensagem gravada sem o
campo **não apareceria para o próprio cliente que a escreveu**.

---

## Por que isto é mais seguro do que os dois estados anteriores

| | prova de posse | limite de tentativas | expira |
|---|---|---|---|
| antes de 31/08 | nenhuma | não | não |
| hoje | sessão do portal (que o cliente nunca tem) | — | — |
| proposta | número + código | 5/hora, por chamado | sim |

Não é só "desfazer o engano": o estado anterior também não servia. Qualquer
pessoa com a chave do app podia escrever em qualquer chamado.

---

## Pergunta de produto, não de segurança

Quando o chamado está em **"Aguardando sua resposta"** (`aguardando_cliente`) e
o cliente responde, o status deve voltar sozinho para **"Em atendimento"**?

Faz sentido operacional — é a pendência sendo respondida —, mas é decisão de
processo, não consequência técnica. Não implemento sem definição.

---

## Sobre a aleatoriedade do código (assunto separado, mas relacionado)

O código de 6 é gerado com `Math.random`, porque o sandbox não expõe `crypto`.
`Math.random` no V8 é xorshift128+: quem coletar alguns códigos consegue
calcular os próximos. O bloqueio por tentativas protege contra força bruta, mas
não contra previsão.

Já existe o pedido em `docs/pedido-hefler-aleatoriedade-sandbox.md` para expor
`ctx.randomBytes`. Se este par (número + código) vai virar a porta oficial do
cliente — ler **e** escrever —, esse pedido deixa de ser melhoria e passa a ser
requisito.
