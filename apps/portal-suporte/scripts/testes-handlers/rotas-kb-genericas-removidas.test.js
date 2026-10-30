// As rotas de ESCRITA e de leitura genéricas de `/kb` saíram do registro.
//
//   GET /kb, GET /kb/:id, PUT /kb/:id, DELETE /kb/:id   (operavam no modelo de chamados)
//   POST /kb                                            (criava artigo; a tela deixou de chamá-la)
//
// Eram o CRUD que o gerador produz, apontado para o modelo ERRADO: operavam em chamados
// (`ctx.models.Ticket`), não em artigos. As duas últimas escreviam: `PUT /kb/:id` alterava qualquer campo
// de um chamado a partir do corpo, sem validação, e `DELETE /kb/:id` apagava o chamado. O nível mínimo
// era o de suporte. A leitura devolvia a forma errada (`data`, e a tela esperava `articles`) e nunca
// listou artigo algum.
//
// O QUE SE GARANTE:
//   - as quatro rotas não existem mais no registro, e NENHUMA rota com `/kb/:id` existe;
//   - `POST /kb/suggest` (lê `KbArticle`, alimenta as sugestões do assistente de novo chamado) segue valendo,
//     é a ÚNICA rota do módulo `kb`, e nenhuma rota sob `/kb` toca o modelo de chamados;
//   - nenhuma rota sob `/kb` GRAVA: a base de documentos é o acervo de arquivos;
//   - o artigo já gravado não é tocado: as rotas removidas não liam nem escreviam `KbArticle`.
// MUTAÇÕES: reinserir cada rota removida reprova; uma rota nova do módulo `kb` que toque chamados reprova.
//
// Roda com: node rotas-kb-genericas-removidas.test.js
const fs = require('fs')
const { ok, fim, ARQ } = require('./_carregar.js')

const REMOVIDAS = [['GET', '/kb'], ['GET', '/kb/:id'], ['PUT', '/kb/:id'], ['DELETE', '/kb/:id'], ['POST', '/kb']]
const MANTIDAS = [['POST', '/kb/suggest']]

function entradas(texto) {
  // cada entrada do registro começa em "\n  {\n" e termina no "\n  }" seguinte
  const out = []
  const partes = texto.split('\n  {\n')
  for (let i = 1; i < partes.length; i++) {
    const bloco = partes[i]
    const mm = bloco.match(/^\s*(?:module: "([\w-]+)",\n\s*)?method: "(\w+)",\n\s*path: "([^"]+)",/)
    if (!mm) continue
    out.push({ modulo: mm[1] || '', metodo: mm[2], caminho: mm[3], texto: bloco.slice(0, bloco.indexOf('\n  }') < 0 ? bloco.length : bloco.indexOf('\n  }')) })
  }
  return out
}
function checar(texto) {
  const f = []
  const e = entradas(texto)
  const chaves = new Set(e.map((x) => x.metodo + ' ' + x.caminho))
  for (const [m, p] of REMOVIDAS) if (chaves.has(m + ' ' + p)) f.push('presente:' + m + ' ' + p)
  if (e.some((x) => /^\/kb\/:/.test(x.caminho))) f.push('rota-kb-por-id-existe')
  for (const [m, p] of MANTIDAS) if (!chaves.has(m + ' ' + p)) f.push('ausente:' + m + ' ' + p)
  // NENHUMA rota sob `/kb`, de qualquer módulo, toca o modelo de chamados: é o que impede a rota genérica do gerador de voltar
  for (const x of e.filter((y) => /^\/kb(\/|$)/.test(y.caminho))) {
    if (/models\.Ticket\b/.test(x.texto.replace(/\\"/g, '"'))) f.push('kb-toca-chamado:' + x.metodo + ' ' + x.caminho)
  }
  for (const x of e.filter((y) => /^\/kb(\/|$)/.test(y.caminho))) {
    if (/\.(create|update|delete)\(/.test(x.texto.replace(/\\"/g, '"'))) f.push('kb-grava:' + x.metodo + ' ' + x.caminho)
  }
  for (const x of e.filter((y) => y.modulo === 'kb')) {
    if (!/KbArticle/.test(x.texto)) f.push('kb-sem-KbArticle:' + x.metodo + ' ' + x.caminho)
  }
  return f
}

const texto = fs.readFileSync(ARQ, 'utf8')
const e0 = entradas(texto)
ok('TRAVA: o leitor enxerga o registro (514 rotas)', e0.length === 514, e0.length)
ok('TRAVA: o leitor enxerga as rotas do módulo kb (a que fica)', e0.filter((x) => x.modulo === 'kb').length === 1, e0.filter((x) => x.modulo === 'kb').map((x) => x.metodo + ' ' + x.caminho))
const f0 = checar(texto)
ok('a bateria passa limpa no registro atual', f0.length === 0, f0)
ok('as quatro rotas não existem mais', REMOVIDAS.every(([m, p]) => !e0.some((x) => x.metodo === m && x.caminho === p)), REMOVIDAS.filter(([m, p]) => e0.some((x) => x.metodo === m && x.caminho === p)))
ok('nenhuma rota `/kb/:…` existe', !e0.some((x) => /^\/kb\/:/.test(x.caminho)))
ok('POST /kb/suggest segue, lendo KbArticle', MANTIDAS.every(([m, p]) => e0.some((x) => x.metodo === m && x.caminho === p && /KbArticle/.test(x.texto))), MANTIDAS)
ok('a rota que fica só LÊ: nenhuma rota sob /kb cria, altera ou apaga', e0.filter((x) => /^\/kb(\/|$)/.test(x.caminho)).every((x) => !/\.(create|update|delete)\(/.test(x.texto.replace(/\\"/g, '"'))))
ok('nenhuma rota sob /kb, de qualquer módulo, toca o modelo de chamados', e0.filter((x) => /^\/kb(\/|$)/.test(x.caminho)).every((x) => !/models\.Ticket\b/.test(x.texto.replace(/\\"/g, '"'))))

const ANCORA = '\n  {\n    module: "kb",\n    method: "POST",\n    path: "/kb/suggest",'
for (const [m, p] of REMOVIDAS) {
  if (texto.split(ANCORA).length - 1 !== 1) { ok(`mutação "reinserir ${m} ${p}" aplica`, false, 'âncora'); continue }
  const mut = texto.replace(ANCORA, `\n  {\n    module: "kb",\n    method: "${m}",\n    path: "${p}",\n    authMode: "actor",\n    handler: compileController("// reinserida"),\n  },` + ANCORA)
  const f = checar(mut)
  ok(`mutação "reinserir ${m} ${p}" é pega (${f.join(',')})`, f.some((x) => x === 'presente:' + m + ' ' + p), f)
}
{
  const mut = texto.replace(ANCORA, `\n  {\n    module: "kb",\n    method: "GET",\n    path: "/kb/artigos",\n    authMode: "actor",\n    handler: compileController("async function handler(ctx) { return ctx.models.Ticket.findMany({}) } // KbArticle"),\n  },` + ANCORA)
  const f = checar(mut)
  ok(`mutação "rota nova do kb que toca chamados" é pega (${f.join(',')})`, f.some((x) => x.startsWith('kb-toca-chamado')), f)
}
{
  const mut = texto.replace(ANCORA, `\n  {\n    module: "outro",\n    method: "GET",\n    path: "/kb/qualquer",\n    authMode: "actor",\n    handler: compileController("async function handler(ctx) { return ctx.models.Ticket.findMany({}) }"),\n  },` + ANCORA)
  const f = checar(mut)
  ok(`mutação "rota sob /kb de OUTRO módulo que toca chamados" é pega (${f.join(',')})`, f.some((x) => x.startsWith('kb-toca-chamado')), f)
}
{
  const mut = texto.replace(ANCORA, `\n  {\n    module: "kb",\n    method: "POST",\n    path: "/kb/importar",\n    authMode: "actor",\n    handler: compileController("async function handler(ctx) { return ctx.models.KbArticle.create(ctx.body) }"),\n  },` + ANCORA)
  const f = checar(mut)
  ok(`mutação "rota nova sob /kb que GRAVA artigo" é pega (${f.join(',')})`, f.some((x) => x.startsWith('kb-grava')), f)
}
{
  const mut = texto.replace('\n    method: "POST",\n    path: "/kb/suggest",', '\n    method: "POST",\n    path: "/kb/sugerir",')
  const f = checar(mut)
  ok(`mutação "POST /kb/suggest some" é pega (${f.join(',')})`, f.some((x) => x === 'ausente:POST /kb/suggest'), f)
}

fim()
