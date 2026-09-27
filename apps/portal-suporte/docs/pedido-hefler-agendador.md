# Pedido à Arara Platform — falta o agendador

**Para:** Hefler
**De:** Portal de Suporte · 04/09/2026

> Substitui o pedido de três capacidades
> (`pedido-plataforma-egresso-webhook-agendador.md`). **Duas das três já estão
> no ar** — este documento existe para não te pedir o que você já entregou. O
> anterior fica intocado como registro.

## O que já está resolvido (verificado hoje, não por memória)

| Pedido original | Estado |
|---|---|
| 1. Egresso de rede no sandbox | **PRONTO.** `ctx.fetch` funciona — 13 rotas do portal fazem chamada externa hoje (recuperação de senha por WhatsApp, IA do inbox, envio de mensagem). |
| 2. Rota pública com segredo | **PRONTO.** `authMode: webhook_secret` está em uso em 4 rotas (`/tickets/acompanhar`, `/auth/senha/solicitar`, `/auth/senha/redefinir`, `/whatsapp/inbound`). |
| Bônus: `/profiles` devolvia `password_hash` e `mfa_secret` | **CORRIGIDO.** O controller limpa os campos sigilosos antes de responder. |

Obrigado — os dois primeiros aposentaram boa parte do relé.

## O que falta: **um agendador**

Disparar uma rota de módulo em intervalo definido. Um cron por app já basta.

Não há substituto do nosso lado, e isso está confirmado:

- O sandbox não agenda: uma rota só roda quando alguém a chama.
- O portal é **estático** — não tem processo para manter relógio.
- Existiam rotas de cron publicadas (`/cron/worker`, `/cron/sla-check`), mas são
  *stubs* devolvendo 501 e ninguém as chama.
- O agendador que existia no Next (`instrumentation.ts` com `node-cron`) está
  morto por três motivos independentes: retorna antes de registrar quando a
  variável do Arara está definida, o arquivo é retirado antes do build estático,
  e os módulos que ele importa não existem mais no repositório.

### O que está parado por causa disso — três consumidores reais

1. **Fechamento automático de chamados.** A rota
   `POST /jobs/auto-close-tickets` está implementada e testada (fecha o que está
   resolvido há mais de 72 h, com `dry_run`). **Ninguém a chama.** Na prática,
   chamados resolvidos ficam em "Resolvido" para sempre até alguém fechar à mão.

2. **As automações de tempo do WhatsApp.** O bloco "Atraso" do editor de fluxo
   deixa a conversa pendurada indefinidamente, e as automações por tempo nunca
   disparam. É a última peça do relé (`src/clock.js`) — com o agendador, o
   repositório `arara-wa-relay` é apagado.

3. **Vigiar a hospedagem.** Em 03/09 o processo do portal saiu
   (`"Process exited with code 0"`) e ficou em 502 sem avisar ninguém. Montamos
   uma sonda fora da plataforma que chama `POST /hosting/start`, mas ela é
   remendo: roda no Mac de alguém e cobre um app só.

### Formato que serve

Qualquer um destes resolve, em ordem de preferência:

- **Cron por rota**, declarado junto com a rota (ex.: `schedule: "*/5 * * * *"`).
- **Cron por app**, chamando uma rota fixa que a gente reparte por dentro.
- **Só um webhook de saída periódico**, que bate numa URL nossa. Menos elegante,
  mas destrava os três.

Se precisar de trava, uma execução por vez por rota e um teto de duração já
bastam; nenhum dos três casos é pesado.

## Um item menor, no mesmo pacote

`requiredPermissions` está **vazio em todas as rotas** do módulo `whatsapp` (e
na prática em todo o app). Resolvemos por dentro do controller, lendo
`portal-suporte-Profile.role` — hoje 442 rotas do portal exigem sessão de pessoa
por esse caminho. Funciona, mas é regra nossa repetida em cada rota. Se a
plataforma passar a aplicar `requiredPermissions` por papel de app, isso sai do
controller e deixa de depender da nossa disciplina.

Não é urgente. O agendador é.

## Se o agendador vier

| Entregue | O que sai do nosso lado |
|---|---|
| Agendador | `src/clock.js` e o repositório `arara-wa-relay` inteiro |
| Agendador | a sonda de queda do portal (`scripts/sonda-portal.sh`) |
| Agendador | o fechamento automático volta a funcionar sem nada externo |

## E uma sugestão, se couber

O caso 3 tem uma solução melhor que agendar: **a plataforma reiniciar sozinha um
processo de hospedagem que morreu.** Ela é quem hospeda e é a única que sabe na
hora — quem sonda de fora só descobre no ciclo seguinte. Isso resolveria para
todos os apps, não só para o portal, e aí a sonda nem precisa existir.

Vale entender também **por que o processo saiu com código 0**: código 0 é saída
limpa, não queda. Alguma coisa mandou aquele processo terminar.
