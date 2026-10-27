// Na caixa de entrada, em aparelho de toque: o menu "⋯" da mensagem aparece sem hover, e o painel do contato
// (que abaixo de `xl` ocupa o lugar da conversa) tem um botão para voltar.
//
// O QUE SE GARANTE (texto da tela, sem comentários):
//   - `message-actions.tsx`: o botão continua escondido até o hover/foco/aberto no mouse, e em `pointer-coarse`
//     fica sempre visível e maior;
//   - `inbox-client.tsx`: o bloco do CRM tem a barra "Voltar à conversa", só abaixo de `xl` (`xl:hidden`),
//     que fecha o painel (`setCrmOpen(false)`), dentro do bloco do CRM e antes do painel; o bloco continua
//     escondido quando fechado e visível em `xl`.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node toque-e-painel-do-contato.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const DIR = path.resolve(__dirname, '../../app/_components/inbox')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\s*\}/g, '')
const ACOES = semComentarios(fs.readFileSync(path.join(DIR, 'message-actions.tsx'), 'utf8'))
const CLIENT = semComentarios(fs.readFileSync(path.join(DIR, 'inbox-client.tsx'), 'utf8'))

function bateriaAcoes(c) {
  const f = []
  if (!/aberto \? 'opacity-100' : '[^']*opacity-0[^']*group-hover:opacity-100[^']*focus-visible:opacity-100[^']*'/.test(c)) f.push('mouse-mudou')
  if (!/aberto \? 'opacity-100' : '[^']*pointer-coarse:opacity-100[^']*'/.test(c)) f.push('toque-sem-visibilidade')
  if (!/h-7 w-7 pointer-coarse:h-9 pointer-coarse:w-9/.test(c)) f.push('toque-sem-alvo-maior')
  return f
}

function bateriaClient(c) {
  const f = []
  const iBloco = c.indexOf('<CrmContextPanel')
  const iBarra = c.indexOf('Voltar à conversa')
  const iAbre = c.lastIndexOf('{selectedId && (', iBloco)
  if (iBloco < 0 || iBarra < 0 || iAbre < 0 || !(iAbre < iBarra && iBarra < iBloco)) { f.push('barra-fora-do-bloco-ou-depois-do-painel'); return f }
  const bloco = c.slice(iAbre, iBloco)
  if (!/crmOpen \? 'flex xl:flex' : 'hidden xl:flex'/.test(bloco)) f.push('bloco-fechado-ou-aberto-errado')
  if (!/className="[^"]*xl:hidden[^"]*">\s*<button[^>]*onClick=\{\(\) => setCrmOpen\(false\)\}[^>]*aria-label="Voltar à conversa"/.test(bloco)) f.push('barra-sem-xl-hidden-ou-nao-fecha')
  if (!/onClick=\{\(\) => setCrmOpen\(false\)\}/.test(bloco)) f.push('nao-fecha-o-painel')
  if (!/<ArrowLeft/.test(bloco)) f.push('sem-icone')
  if (!/import \{ ArrowLeft,/.test(c)) f.push('sem-import')
  // a thread continua escondida com o painel aberto, e o botão do thread-pane não foi tocado aqui
  if (!/crmOpen && 'hidden xl:block'/.test(c)) f.push('thread-nao-esconde')
  return f
}

const fa = bateriaAcoes(ACOES)
ok('o menu da mensagem fica visível e maior em toque, e escondido até o hover no mouse', fa.length === 0, fa)
const fc = bateriaClient(CLIENT)
ok('o painel do contato tem "Voltar à conversa" só abaixo de xl, que fecha o painel', fc.length === 0, fc)

const mutsAcoes = [
  ['sem visibilidade em toque', ' pointer-coarse:opacity-100'],
  ['sem alvo maior', ' pointer-coarse:h-9 pointer-coarse:w-9'],
  ['hover trocado por sempre visível', 'opacity-0 group-hover:opacity-100'],
]
for (const [nome, de] of mutsAcoes) {
  if (ACOES.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
  const para = nome.startsWith('hover') ? 'opacity-100' : ''
  const fm = bateriaAcoes(ACOES.replace(de, () => para))
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
const mutsClient = [
  ['barra aparece no desktop', CLIENT.replace('border-b border-border bg-card px-2 py-1.5 xl:hidden', 'border-b border-border bg-card px-2 py-1.5')],
  ['barra não fecha o painel', CLIENT.replace('onClick={() => setCrmOpen(false)}\n                aria-label="Voltar à conversa"', 'onClick={() => {}}\n                aria-label="Voltar à conversa"')],
  ['bloco nunca visível abaixo de xl', CLIENT.replace("crmOpen ? 'flex xl:flex' : 'hidden xl:flex'", "'hidden xl:flex'")],
  ['bloco sempre visível', CLIENT.replace("crmOpen ? 'flex xl:flex' : 'hidden xl:flex'", "'flex'")],
  ['sem a barra', CLIENT.replace('Voltar à conversa"\n                className', 'Voltar"\n                className').replace('                Voltar à conversa\n', '')],
  ['painel antes da barra', CLIENT.replace('<div className="min-h-0 flex-1">\n              <CrmContextPanel conversationId={selectedId} />\n            </div>', '').replace('{selectedId && (', '{selectedId && (<CrmContextPanel conversationId={selectedId} />) && (')],
  ['thread não esconde com o painel aberto', CLIENT.replace("crmOpen && 'hidden xl:block'", '')],
]
for (const [nome, mut] of mutsClient) {
  if (mut === CLIENT) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateriaClient(mut)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
