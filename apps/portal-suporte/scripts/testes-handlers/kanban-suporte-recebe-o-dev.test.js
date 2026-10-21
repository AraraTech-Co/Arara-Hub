// O quadro de Suporte tem de RECEBER o `dev` que a rota manda: a página monta a lista campo a campo
// (`serialized`), e o que ficar fora dela se perde antes de chegar ao card. Foi o que aconteceu com o
// dev responsável (#112): a rota devolvia `dev` e o card nunca o mostrava.
//
// Teste de TEXTO, e por isso dito assim: lê os três pontos por onde o campo passa e afirma que cada um
// o leva adiante. A prova de verdade é ver o card renderizado.
//   1. page.tsx: `serialized` inclui `dev: row.dev`;
//   2. kanban-board.tsx: `normalizeTicket` inclui `dev`, e o ciclo de 30 s atualiza os cards que já
//      estão no quadro quando o dev ou o prazo mudam (não só os novos);
//   3. kanban-card.tsx: lê `ticket.dev`.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node kanban-suporte-recebe-o-dev.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')
const APP = path.resolve(__dirname, '../../app')
const ler = (p) => fs.readFileSync(path.join(APP, p), 'utf8')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PAGINA = semComentarios(ler('(admin)/admin/kanban/page.tsx'))
const BOARD = semComentarios(ler('_components/kanban/kanban-board.tsx'))
const CARD = semComentarios(ler('_components/kanban/kanban-card.tsx'))

function bateria(pagina, board, card) {
  const f = []
  if (!/\bdev:\s*row\.dev\s*\?\?\s*null/.test(pagina)) f.push('page-nao-leva-o-dev')
  if (!/\bdev:\s*t\.dev\s*\?\?\s*null/.test(board)) f.push('normalizeTicket-nao-leva-o-dev')
  if (!/devAtual/.test(board) || !/\{\s*\.\.\.t,\s*dev:\s*novo\s*\}/.test(board)) f.push('polling-nao-atualiza-o-dev-dos-existentes')
  if (!/return newOnes\.length === 0 && !mudou \? prev/.test(board)) f.push('polling-so-devolve-novo-estado-se-mudou')
  if (!/ticket\.dev\b/.test(card) || !/prazoDoDev\(/.test(card)) f.push('card-nao-le-o-dev')
  return f
}

const f0 = bateria(PAGINA, BOARD, CARD)
ok('a página, o quadro e o card levam o `dev` adiante', f0.length === 0, f0)
const muts = [
  ['a página perde o dev', PAGINA.replace('dev: row.dev ?? null', ''), BOARD, CARD],
  ['normalizeTicket perde o dev', PAGINA, BOARD.replace('dev: t.dev ?? null,', ''), CARD],
  ['o polling só adiciona cards novos', PAGINA, BOARD.replace('{ ...t, dev: novo }', 't'), CARD],
  ['o polling devolve sempre o estado antigo', PAGINA, BOARD.replace('return newOnes.length === 0 && !mudou ? prev : [...atualizados, ...newOnes];', 'return newOnes.length === 0 ? prev : [...prev, ...newOnes];'), CARD],
  ['o card ignora o dev', PAGINA, BOARD, CARD.replace(/ticket\.dev/g, 'ticket.devX')],
]
for (const [nome, p, b, c] of muts) {
  const mudou = p !== PAGINA || b !== BOARD || c !== CARD
  if (!mudou) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateria(p, b, c)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
