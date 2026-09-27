# Pedido à Arara Platform — 3 capacidades que aposentam o relé de WhatsApp

**Para:** Hefler
**De:** Portal de Suporte
**Status do portal:** rodando com um relé temporário (`SGC-CCODE/arara-wa-relay`)

## Resumo

Para o portal falar com o WhatsApp foi preciso subir um processo fora da
plataforma. Ele não é um backend do produto — não tem banco, usuário, regra de
negócio nem estado — mas existe só porque faltam três coisas na plataforma.
Atendidas as três, **ele é apagado**.

Enquanto isso, ele é explicitamente temporário e nada será acrescentado a ele
que dificulte a remoção.

## O que foi verificado (não é suposição)

1. **O sandbox não tem rede.** Está no `GET /readme`: *"Sandbox: sem `fs`, rede
   ou `require` arbitrário"*. Confirmado varrendo o `controllerCode` de todas as
   rotas dos **61 módulos** de `portal-suporte`: nenhuma faz chamada externa.
   Logo, nenhum controller consegue entregar uma mensagem ao provedor.

2. **O runtime exige credencial no header.** Testado contra produção:

   | Tentativa | Resposta |
   |---|---|
   | `GET /v1/r/portal-suporte/whatsapp?api_key=...` | 401 |
   | `GET /v1/r/portal-suporte/whatsapp?token=...` | 401 |
   | `GET /v1/r/portal-suporte/whatsapp?apiKey=...` | 401 |

   O provedor de WhatsApp (Avisa) não envia header — o segredo dele vai no corpo
   do formulário ou na query. Então o webhook dele não alcança a plataforma.

3. **Não há agendador.** Existem rotas de cron publicadas
   (`/cron/wa-automations`, `/cron/sla-check`), mas nada as chama: o deploy é
   Docker, então cron da Vercel é ignorado, e o sandbox não agenda. Sem isso, o
   bloco "Atraso" do editor de fluxo deixa a conversa pendurada para sempre e as
   automações de tempo nunca disparam.

## Os três pedidos

### 1. Egresso por lista de permissão no sandbox

Algo como `ctx.http.fetch(url, init)` que só aceite hosts previamente
autorizados por app, com timeout e sem redirecionamento automático.

O portal já tem a lista de permissão escrita para o bloco "Integração" do editor
de fluxo (`app/lib/wa-webhook.ts`): só https, porta 443, host que resolve para
IP público em **todos** os registros, `redirect: 'manual'`, timeout curto,
fail-closed. Serve de ponto de partida — foi escrita justamente contra SSRF, que
é o risco de dar saída a código de terceiros.

**Aposenta:** o envio pelo relé (`POST /send`, `src/avisa.js`).

### 2. Rota de webhook autenticada por segredo

Marcar uma rota do módulo como pública-com-segredo: a plataforma compara um
token (query ou corpo) em tempo constante, sem exigir `x-api-key`. Só isso.

Sem ela, nenhum provedor externo consegue entregar evento na plataforma — vale
para WhatsApp hoje e para qualquer integração amanhã.

**Aposenta:** o webhook do relé (`POST /webhook/avisa`).

### 3. Agendador

Disparar uma rota do módulo em intervalo definido. Um cron por app já basta.

**Aposenta:** o relógio do relé (`src/clock.js`).

## Sobre o cofre de segredos que você já vai fazer

Soubemos que está no forno um endpoint que criptografa chaves no banco, para
tornar seguro cadastrar credencial de API. Isso resolve exatamente o motivo pelo
qual o token do provedor de WhatsApp ficou no ambiente do relé em vez de numa
tela de configuração — o portal é estático e a camada de models devolve o
registro inteiro (ver abaixo), então segredo em model estava fora de cogitação.

O que ele precisa garantir para a gente migrar com segurança:

1. **Escrita apenas.** Nenhuma rota alcançável pelo navegador pode devolver o
   valor em claro — nem para admin, nem para master. A leitura serve para
   *conferir qual* segredo está no ar, não *qual é*: devolver `••••7f3a` +
   quem cadastrou e quando resolve a tela inteira.
2. **Leitura por consumidor identificado.** Quem precisa do valor em claro é o
   processo que usa a credencial. Se o egresso (pedido nº 1) existir, esse
   processo é o próprio controller, e aí o valor nunca sai da plataforma — o
   ideal. Enquanto não existir, é o relé, e ele precisa de um caminho de leitura
   que uma credencial de navegador não alcance.
3. **Rotação sem downtime** e **registro de quem trocou**.
4. **Nunca em log.** Nem no de erro do provedor, que costuma ecoar o corpo.

Com (1) e (2), a tela de conexão do portal passa a cadastrar o token, e a
variável de ambiente do relé some. Do nosso lado a mudança é pequena porque o
acesso ao token está isolado num ponto só (`src/avisa.js`).

**Isto não substitui os três pedidos acima.** O cofre resolve *guardar*
credencial; o relé existe por causa de *rede* e *header*. Mesmo com o cofre
pronto, sem egresso nenhum controller consegue entregar a mensagem.

## Dois problemas menores, no mesmo pacote

- **`GET /v1/r/portal-suporte/profiles` devolve `password_hash` e `mfa_secret`**
  de todos os perfis para qualquer credencial aceita. A camada de models parece
  devolver o registro inteiro por padrão — o que reforça o ponto (1) acima: o
  cofre só é seguro se a exceção à leitura for garantida pela plataforma, e não
  pela disciplina de cada controller.

- **`requiredPermissions` vazio** em todas as 44 rotas do módulo `whatsapp`.
  Resolvemos no padrão que o Horas usa (checagem dentro do controller, lendo
  `portal-suporte-Profile.role`), mas se a plataforma passar a aplicar
  `requiredPermissions` por papel de app, isso sai do controller.

## Plano de remoção do relé

| Capacidade entregue | O que sai |
|---|---|
| Egresso | `src/avisa.js`, `POST /send` — o envio vira controller |
| Webhook por segredo | `POST /webhook/avisa`, `src/avisa-payload.js` migra para o controller de inbound |
| Agendador | `src/clock.js` |

Feitas as três, o repositório `arara-wa-relay` é apagado e o portal volta a
falar exclusivamente com `api.arara-tech.com`.
