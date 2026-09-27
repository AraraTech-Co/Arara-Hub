# Pedido ao Hefler — fonte de aleatoriedade no sandbox dos controllers

**Data:** 28/08/2026 · **De:** Leonardo
**Tamanho:** pequeno do seu lado · **Impede:** que uma senha de acesso do cliente seja previsível

---

## O pedido, em uma linha

Expor no `ctx` dos controllers uma fonte de aleatoriedade criptográfica — por exemplo
`ctx.randomBytes(n)` devolvendo hex, ou `ctx.randomUUID()`.

---

## Por que

O sandbox **não tem `crypto`** (sondado em 19/08, quando montamos a sessão do portal).
O que sobra é `Math.random()`, que no V8 é `xorshift128+`: bom para embaralhar lista,
**não** para gerar segredo. Quem coleta alguns valores consegue reconstruir o estado do
gerador e prever os próximos.

Até hoje contornamos sorteando **no navegador** com `crypto.getRandomValues` e mandando o
valor pronto para o controller — é assim que funcionam o token de sessão do portal e o
código de handoff do Arara Hub.

**Agora esse contorno não serve**, e é por isso que estou pedindo: o próximo caso nasce
**sem navegador nenhum**.

## O caso concreto

Quando o cliente abre um chamado pelo WhatsApp, o robô cria o chamado dentro de um
controller e precisa gerar uma **senha de seis caracteres** para aquele chamado. A pessoa
recebe número + senha na mensagem e acompanha o andamento na página pública.

Não há navegador nesse fluxo: é servidor puro, disparado por webhook. Se a senha sair de
`Math.random()`, quem abrir alguns chamados próprios pode calcular a senha dos chamados
dos outros — e chamado carrega print de erro, nome de servidor, CNPJ.

O limite de tentativas que vamos pôr segura quem **chuta**. Não segura quem **calcula**.

## O que serviria

Qualquer uma destas, na sua preferência:

```js
const hex = await ctx.randomBytes(16)   // string hex
const id  = ctx.randomUUID()            // uuid v4
```

Não precisa ser assíncrono nem sofisticado — só precisa vir de fonte criptográfica do
host, e não do `Math.random` do isolate.

## Se não der

Seguimos com `Math.random` mais trava de tentativas, e fica registrado como dívida no
documento da funcionalidade. Funciona contra chute; não contra quem estuda o gerador. É
uma escolha que preferimos não fazer em silêncio.

---

## Contexto, se quiser ver

Especificação da funcionalidade:
`SGC-CCODE/docs/plans/especificacao-acompanhamento-do-cliente.md` (seção 3.1 é exatamente
este assunto).
