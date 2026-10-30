# Testes de handler do backend

O backend do portal é um arquivo só — `packages/api/src/apps/portal-suporte/routes.generated.ts` —
e cada handler mora como **string** dentro de `compileController("…")`. Não há `tsc` em
`packages/api` e não existe staging: produção é ambiente único, ao vivo.

Estes testes são o que substitui o build do backend. Cada um extrai o handler pela marca do
cabeçalho, executa num contexto de `vm` com um `ctx` falso e cobre:

- quem **pode** e quem **não pode** (401 e 403) — é o handler **exportado** que roda, com as guardas;
- o caminho de erro (400, 404, 409) e, principalmente, **que nada foi gravado quando a recusa acontece**;
- o caso de borda que motivou a mudança.

## Rodar

```bash
cd apps/portal-suporte/scripts/testes-handlers
for t in *.test.js; do echo "== $t"; node "$t"; done
```

Saída limpa = todos os casos passaram; qualquer falha sai com código 1.

## Escrever um novo

```js
const { carregarHandler, reply, ok, fim } = require('./_carregar.js')
const handler = carregarHandler('490b profiles POST /admin/membros')   // marca do cabeçalho
```

Monte `ctx.models.<Model>` com `findById`/`findMany`/`create`/`update`/`delete` falsos que
**registrem o que foi chamado** — é assim que se prova que uma recusa não escreveu nada.

## O perímetro

`perimetro-sem-pessoa.test.js` varre TODAS as rotas publicadas: chama cada handler
exportado com uma credencial de aplicativo sem pessoa e exige 401 ou 403. As que podem
responder sem pessoa estão nomeadas em `PUBLICAS`, uma a uma, com o motivo — e a lista não
apodrece: entrada que não existe mais, ou que hoje recusa, reprova o teste.

É por COMPORTAMENTO de propósito. O `conferir-guarda.py` procura a marca da guarda no
código, e marca presente não é guarda aplicada: o invólucro pode estar definido no corpo e a
exportação entregar o handler cru. Só chamar o handler exportado prova. Rota nova sem guarda
volta a aparecer aqui sem ninguém precisar lembrar de conferir — e sem chave nem rede.

```bash
node perimetro-sem-pessoa.test.js
python3 mutar-perimetro.py   # 8 mutações; cada uma reprova numa asserção nomeada
```

Depois de mexer num handler, rode também:

```bash
node <scratchpad>/valida.js packages/api/src/apps/portal-suporte/routes.generated.ts   # todos os handlers continuam válidos
python3 apps/portal-suporte/scripts/conferir-guarda.py                                  # guarda de sessão nas rotas
```
