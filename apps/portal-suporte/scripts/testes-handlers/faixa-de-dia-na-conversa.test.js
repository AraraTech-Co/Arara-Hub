// A conversa mostra uma faixa quando muda o dia entre duas mensagens.
//
// A bolha só tinha HH:MM: uma conversa que atravessa dias não dizia onde um dia acaba e outro começa.
//
// O QUE SE GARANTE:
//   - O HELPER (`lib/inbox/faixa-de-dia.ts`, executado de verdade, no fuso do navegador): rótulo "Hoje",
//     "Ontem", "12 de outubro" e, de outro ano, "12 de outubro de 2025"; a primeira mensagem abre faixa; dois
//     horários do mesmo dia não; dias diferentes sim; data ilegível não quebra nem abre faixa;
//   - A LISTA (texto, sem comentários): a faixa é um separator desenhado antes da bolha; a primeira mensagem depois
//     dela NÃO é continuação (mesma razão do divisor de não lidas); faixa e divisor coexistem, faixa primeiro;
//     o horário continua HH:MM e ganha a data completa no title.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node faixa-de-dia-na-conversa.test.js   (Node 22.18+/24+ carrega .ts sem build)
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../../app')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HELPER_SRC = fs.readFileSync(path.join(APP, 'lib/inbox/faixa-de-dia.ts'), 'utf8')
const LISTA = semComentarios(fs.readFileSync(path.join(APP, '_components/inbox/message-list.tsx'), 'utf8'))

function carregar(codigo, nome) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'faixa-'))
  const f = path.join(dir, nome + '.ts')
  fs.writeFileSync(f, codigo)
  const m = require(f)
  delete require.cache[f]
  return m
}

// datas em horário LOCAL, para a bateria valer em qualquer fuso
const iso = (y, mes, d, h = 12, min = 0) => new Date(y, mes - 1, d, h, min).toISOString()
const AGORA = new Date(2026, 9, 23, 15, 0)

function bateriaHelper(m) {
  const f = []
  const r = (s) => m.rotuloDoDia(s, AGORA)
  if (r(iso(2026, 10, 23, 8)) !== 'Hoje') f.push('hoje')
  if (r(iso(2026, 10, 22, 23, 59)) !== 'Ontem') f.push('ontem')
  if (r(iso(2026, 10, 12)) !== '12 de outubro') f.push('mesmo-ano')
  if (r(iso(2025, 10, 12)) !== '12 de outubro de 2025') f.push('outro-ano-com-ano')
  if (r(iso(2026, 1, 1)) !== '1 de janeiro') f.push('janeiro')
  if (r(iso(2025, 12, 31)) !== '31 de dezembro de 2025') f.push('virada-de-ano')
  // ontem atravessando mês e ano
  if (m.rotuloDoDia(iso(2025, 12, 31), new Date(2026, 0, 1, 9)) !== 'Ontem') f.push('ontem-na-virada-de-ano')
  if (m.rotuloDoDia(iso(2026, 2, 28), new Date(2026, 2, 1, 9)) !== 'Ontem') f.push('ontem-na-virada-de-mes')
  if (m.rotuloDoDia('lixo', AGORA) !== '') f.push('rotulo-ilegivel')
  if (m.chaveDoDia('lixo') !== '') f.push('chave-ilegivel')
  // abre faixa?
  if (m.abreDiaNovo(iso(2026, 10, 23, 9), null) !== true) f.push('primeira-abre')
  if (m.abreDiaNovo(iso(2026, 10, 23, 18), iso(2026, 10, 23, 9)) !== false) f.push('mesmo-dia-nao-abre')
  if (m.abreDiaNovo(iso(2026, 10, 23, 0, 5), iso(2026, 10, 22, 23, 55)) !== true) f.push('dia-seguinte-abre')
  if (m.abreDiaNovo(iso(2026, 11, 23), iso(2026, 10, 23)) !== true) f.push('mesmo-dia-do-mes-seguinte-abre')
  if (m.abreDiaNovo(iso(2027, 10, 23), iso(2026, 10, 23)) !== true) f.push('mesmo-dia-do-ano-seguinte-abre')
  if (m.abreDiaNovo('lixo', iso(2026, 10, 23)) !== false) f.push('ilegivel-nao-abre')
  if (m.abreDiaNovo(iso(2026, 10, 23), 'lixo') !== true) f.push('anterior-ilegivel-abre')
  // title
  const dc = m.dataCompleta(iso(2026, 10, 12, 14, 5))
  if (!/^12 de outubro de 2026, /.test(dc) || !/14.05/.test(dc)) f.push('data-completa')
  if (m.dataCompleta('lixo') !== '') f.push('data-completa-ilegivel')
  return f
}

function bateriaLista(c) {
  const f = []
  if (!/import \{ abreDiaNovo, dataCompleta, rotuloDoDia \} from '@\/lib\/inbox\/faixa-de-dia'/.test(c)) f.push('sem-import')
  if (!/const faixaAntes = abreDiaNovo\(m\.timestamp, anterior \? anterior\.timestamp : null\)/.test(c)) f.push('faixa-nao-vem-do-helper')
  if (!/const continua = mesmoBloco && i !== iDivisor && !faixaAntes/.test(c)) f.push('primeira-apos-faixa-e-continuacao')
  if (!/continuacao=\{continua\}/.test(c) || !/className=\{continua \? 'mt-1'/.test(c)) f.push('bolha-nao-usa-continua')
  const iFaixa = c.indexOf('{faixaAntes && (')
  const iDiv = c.indexOf('{i === iDivisor && (')
  const iBolha = c.indexOf('<MessageBubble')
  if (iFaixa < 0 || iDiv < 0 || iBolha < 0 || !(iFaixa < iDiv && iDiv < iBolha)) f.push('ordem-faixa-divisor-bolha')
  if (!/\{faixaAntes && \([\s\S]{0,200}role="separator"[\s\S]{0,400}rotuloDoDia\(m\.timestamp\)/.test(c)) f.push('faixa-sem-separator-ou-rotulo')
  // o divisor de não lidas continua existindo e não depende da faixa
  if (!/\{i === iDivisor && \(/.test(c)) f.push('divisor-perdido')
  // horário: HH:MM com a data completa no title; fuso do navegador intocado
  if (!/title=\{dataCompleta\(m\.timestamp\)\}>\{messageTime\(m\.timestamp\)\}/.test(c)) f.push('title-sem-data')
  if (!/toLocaleTimeString\('pt-BR', \{ hour: '2-digit', minute: '2-digit' \}\)/.test(c)) f.push('hora-mudou')
  if (/timeZone/.test(c)) f.push('mexeu-no-fuso')
  return f
}

const hf = bateriaHelper(carregar(HELPER_SRC, 'helper'))
ok('o helper rotula Hoje/Ontem/data (com ano só se muda) e abre faixa só na troca de dia', hf.length === 0, hf)
const lf = bateriaLista(LISTA)
ok('a lista desenha a faixa antes do divisor, a 1ª depois dela não é continuação, o title leva a data', lf.length === 0, lf)

const mutsHelper = [
  ['ano sempre omitido', "return d.getFullYear() === agora.getFullYear() ? base : `${base} de ${d.getFullYear()}`", 'return base'],
  ['ano sempre mostrado', "return d.getFullYear() === agora.getFullYear() ? base : `${base} de ${d.getFullYear()}`", 'return `${base} de ${d.getFullYear()}`'],
  ['chave só com mês e dia', 'return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`', 'return `${d.getMonth()}-${d.getDate()}`'],
  ['chave só com dia', 'return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`', 'return `${d.getDate()}`'],
  ['ontem = hoje - 1 sem normalizar mês', 'agora.getDate() - 1)', 'agora.getDate() - 2)'],
  ['sem Hoje', "if (chaveDe(d) === chaveDe(agora)) return 'Hoje'", ''],
  ['primeira não abre faixa', 'return anteriorIso === null || chaveDoDia(anteriorIso) !== c', 'return anteriorIso !== null && chaveDoDia(anteriorIso) !== c'],
  ['sempre abre', 'return anteriorIso === null || chaveDoDia(anteriorIso) !== c', 'return true'],
  ['ilegível abre faixa', "if (!c) return false", ''],
  ['data completa sem ano', 'de ${MESES[d.getMonth()]} de ${d.getFullYear()}, ${hora}', 'de ${MESES[d.getMonth()]}, ${hora}'],
]
for (const [nome, de, para] of mutsHelper) {
  if (HELPER_SRC.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
  let fm
  try { fm = bateriaHelper(carregar(HELPER_SRC.replace(de, () => para), 'mut')) } catch (e) { fm = ['erro: ' + e.message] }
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
const mutsLista = [
  ['a 1ª depois da faixa vira continuação', LISTA.replace('mesmoBloco && i !== iDivisor && !faixaAntes', 'mesmoBloco && i !== iDivisor')],
  ['a faixa derruba o divisor', LISTA.replace('{i === iDivisor && (', '{i === iDivisor && !faixaAntes && (')],
  ['faixa depois do divisor', LISTA.replace('{faixaAntes && (', '{false && (').replace('<MessageBubble', '{faixaAntes && (<div role="separator">{rotuloDoDia(m.timestamp)}</div>)}<MessageBubble')],
  ['title sem a data', LISTA.replace('title={dataCompleta(m.timestamp)}', '')],
  ['mexe no fuso', LISTA.replace("toLocaleTimeString('pt-BR', {", "toLocaleTimeString('pt-BR', { timeZone: 'UTC',")],
  ['faixa sem rótulo', LISTA.replace('{rotuloDoDia(m.timestamp)}', '')],
  ['faixa não vem do helper', LISTA.replace('abreDiaNovo(m.timestamp, anterior ? anterior.timestamp : null)', 'i === 0')],
]
for (const [nome, mut] of mutsLista) {
  if (mut === LISTA) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateriaLista(mut)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
