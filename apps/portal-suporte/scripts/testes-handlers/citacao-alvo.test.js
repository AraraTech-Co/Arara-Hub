// Clicar na citação leva até a mensagem citada (app/lib/inbox/citacao.ts).
//
// `acharMensagemCitada` decide qual das mensagens carregadas a citação aponta. A parte
// de tela (rolar, destacar, avisar quando não está carregada) é JSX sem renderizador
// neste projeto; aqui se prova a decisão.
//
// O QUE SE GARANTE:
//   - acha a mensagem pelo `message_id` guardado na citação, inclusive id provisório
//     (`local_…`) de mensagem nossa;
//   - devolve `null` quando a citada não está carregada, e para id vazio ou ausente;
//   - não confunde ids parecidos (prefixo, caixa) nem usa o `id` da linha no lugar do `message_id`;
//   - com ids repetidos devolve a primeira da lista.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node citacao-alvo.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const ARQ_TS = path.resolve(__dirname, '../../app/lib/inbox/citacao.ts')
function carregar(texto) {
  // remove as anotações de tipo do arquivo (único recurso de TypeScript usado) e executa
  const js = texto
    .replace(/export function acharMensagemCitada<[^>]*\{[^}]*\}>\(/, 'function acharMensagemCitada(')
    .replace(/\n\s+mensagens: T\[\],\n\s+idCitado: string \| null \| undefined,\n\)\s*:\s*T \| null \{/, '\n  mensagens, idCitado\n) {')
  const m = { exports: {} }
  new Function('module', js + '\nmodule.exports = { acharMensagemCitada }')(m)
  return m.exports.acharMensagemCitada
}
const fonte = fs.readFileSync(ARQ_TS, 'utf8')

const msgs = [
  { id: 'r1', message_id: '3EB0CLIENTE', body: 'oi' },
  { id: 'r2', message_id: 'local_1760000000000', body: '[imagem enviada]' },
  { id: 'r3', message_id: null, body: 'sem id' },
  { id: 'r4', message_id: '3EB0CLIENTE2', body: 'outra' },
  { id: 'r5', message_id: '3EB0CLIENTE', body: 'duplicada' },
]
function bateria(achar) {
  const f = []
  if (achar(msgs, '3EB0CLIENTE')?.id !== 'r1') f.push('acha-pelo-message_id')
  if (achar(msgs, 'local_1760000000000')?.id !== 'r2') f.push('id-provisorio')
  if (achar(msgs, '3EB0INEXISTENTE') !== null) f.push('fora-da-tela')
  for (const v of [null, undefined, '']) if (achar(msgs, v) !== null) f.push('id-vazio:' + String(v))
  if (achar(msgs, '3EB0CLIENT') !== null || achar(msgs, '3eb0cliente') !== null) f.push('prefixo-ou-caixa')
  if (achar(msgs, 'r1') !== null) f.push('usa-id-da-linha')
  if (achar(msgs, '3EB0CLIENTE')?.id !== 'r1') f.push('primeira')
  if (achar([], '3EB0CLIENTE') !== null) f.push('lista-vazia')
  return f
}

;(() => {
  const achar = carregar(fonte)
  ok('TRAVA: o helper carregou do arquivo real e devolve uma mensagem', typeof achar === 'function' && achar(msgs, '3EB0CLIENTE') && achar(msgs, '3EB0CLIENTE').id === 'r1', typeof achar)
  ok('acha a mensagem pelo message_id da citação', achar(msgs, '3EB0CLIENTE').id === 'r1', achar(msgs, '3EB0CLIENTE'))
  ok('mensagem nossa com id provisório (local_…) também é achada', achar(msgs, 'local_1760000000000').id === 'r2', 'r2')
  ok('citada fora do que está carregado: null', achar(msgs, '3EB0INEXISTENTE') === null, 'null')
  ok('id vazio, nulo ou ausente: null', [null, undefined, ''].every((v) => achar(msgs, v) === null), 'null')
  ok('não confunde prefixo, caixa nem usa o id da linha', achar(msgs, '3EB0CLIENT') === null && achar(msgs, '3eb0cliente') === null && achar(msgs, 'r1') === null, 'null')
  ok('com ids repetidos devolve a primeira', achar(msgs, '3EB0CLIENTE').id === 'r1', 'r1')
  ok('a bateria passa limpa', bateria(achar).length === 0, bateria(achar))
  const muts = [
    ['usa o id da linha', 'm.message_id === idCitado', 'm.id === idCitado'],
    ['compara por prefixo', 'm.message_id === idCitado', '(m.message_id || "").startsWith(idCitado)'],
    ['ignora a caixa', 'm.message_id === idCitado', '(m.message_id || "").toLowerCase() === idCitado.toLowerCase()'],
    ['id vazio acha a primeira sem id', 'if (!idCitado) return null', ''],
    ['devolve a última, não a primeira', 'mensagens.find(', 'mensagens.slice().reverse().find('],
    ['nunca acha', '?? null\n}', '&& null\n}'],
  ]
  for (const [nome, de, para] of muts) {
    const n = fonte.split(de).length - 1
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue }
    let f
    try { f = bateria(carregar(fonte.replace(de, () => para))) } catch (e) { ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e)); continue }
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu')
  }
  fim()
})()
