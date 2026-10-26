// O comentário interno mostra e edita o texto com as quebras de linha que a pessoa escreveu.
//
// O QUE SE GARANTE:
//   - O HELPER (`lib/tickets/texto-do-comentario.ts`, executado de verdade): \n e \n\n ficam; CRLF vira \n;
//     três ou mais quebras viram duas; espaços e tabs se colapsam; fim de bloco e <br> viram quebra; as demais
//     tags saem; texto sem quebra e sem tag passa igual; vazio continua vazio;
//   - A TELA (texto, sem comentários): corpo, original e abertura da edição usam o helper; o salvar só
//     descarta a edição quando o texto é igual ao normalizado (editar sem mudar nada não regrava);
//     nenhuma cópia local que achata `\s+`.
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node quebras-no-comentario.test.js   (Node 22.18+/24+ carrega .ts sem build)
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../../app')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HELPER_SRC = fs.readFileSync(path.join(APP, 'lib/tickets/texto-do-comentario.ts'), 'utf8')
const TELA = semComentarios(fs.readFileSync(path.join(APP, '_components/tickets/ticket-internal-comments.tsx'), 'utf8'))

function carregar(codigo, nome) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'quebras-'))
  const f = path.join(dir, nome + '.ts')
  fs.writeFileSync(f, codigo)
  const m = require(f)
  delete require.cache[f]
  return m
}

function bateriaHelper(m) {
  const f = []
  const t = m.textoDoComentario
  const eq = (nome, got, want) => { if (got !== want) f.push(`${nome}: ${JSON.stringify(got)}`) }
  eq('uma-quebra', t('a\nb'), 'a\nb')
  eq('paragrafo', t('a\n\nb'), 'a\n\nb')
  eq('crlf', t('a\r\nb\r\n\r\nc'), 'a\nb\n\nc')
  eq('cr-solto', t('a\rb'), 'a\nb')
  eq('tres-viram-duas', t('a\n\n\n\nb'), 'a\n\nb')
  eq('espacos-colapsam', t('a   b\t\tc'), 'a b c')
  eq('espaco-em-volta-da-quebra', t('a  \n  b'), 'a\nb')
  eq('trim-nas-pontas', t('\n\n  a\nb  \n'), 'a\nb')
  eq('sem-quebra-igual', t('texto simples, sem nada'), 'texto simples, sem nada')
  eq('vazio', t(''), '')
  eq('so-espaco', t(' \n \t '), '')
  eq('br', t('a<br>b<br/>c<BR />d'), 'a\nb\nc\nd')
  eq('p', t('<p>um</p><p>dois</p>'), 'um\ndois')
  eq('div-li', t('<div>x</div><ul><li>y</li><li>z</li></ul>'), 'x\ny\nz')
  eq('tag-inline-vira-espaco', t('a<b>b</b>c'), 'a b c')
  eq('html-com-quebra-propria', t('<p>um</p>\n<p>dois</p>'), 'um\n\ndois')
  eq('idempotente', t(t('a\n\n<p>b</p>  c')), t('a\n\n<p>b</p>  c'))
  return f
}

function bateriaTela(c) {
  const f = []
  if (!/import \{ textoDoComentario \} from '@\/lib\/tickets\/texto-do-comentario'/.test(c)) f.push('sem-import')
  if (/function semTags|replace\(\/\\s\+\//.test(c)) f.push('copia-local-que-achata')
  if (/semTags/.test(c)) f.push('semTags-sobrou')
  if (!/setTextoEdicao\(textoDoComentario\(c\.message\)\)/.test(c)) f.push('edicao-abre-sem-helper')
  if (!/message === textoDoComentario\(c\.message\)/.test(c)) f.push('salvar-compara-sem-helper')
  if (!/body: JSON\.stringify\(\{ message \}\)/.test(c)) f.push('patch-nao-manda-o-texto-editado')
  if (!/whitespace-pre-wrap mt-1">\s*\{textoDoComentario\(c\.message\)\}/.test(c)) f.push('corpo-sem-helper')
  if (!/whitespace-pre-wrap">\s*\{textoDoComentario\(c\.texto_original\)\}/.test(c)) f.push('original-sem-helper')
  return f
}

const hf = bateriaHelper(carregar(HELPER_SRC, 'helper'))
ok('o helper preserva as quebras, tira as tags e colapsa só espaço', hf.length === 0, hf)
const tf = bateriaTela(TELA)
ok('corpo, original e edição usam o helper; o salvar compara com o texto normalizado', tf.length === 0, tf)

const mutsHelper = [
  ['achata tudo em espaço', ".replace(/[^\\S\\n]+/g, ' ')", ".replace(/\\s+/g, ' ')"],
  ['não colapsa espaço', ".replace(/[^\\S\\n]+/g, ' ')", ''],
  ['crlf não normaliza', ".replace(/\\r\\n?/g, '\\n')\n", '\n'],
  ['br sem quebra', ".replace(/<br\\s*\\/?>/gi, '\\n')", ".replace(/<br\\s*\\/?>/gi, ' ')"],
  ['fim de bloco sem quebra', "li|h[1-6]|tr)\\s*>/gi, '\\n')", "li|h[1-6]|tr)\\s*>/gi, ' ')"],
  ['tag inline some sem espaço', ".replace(/<[^>]+>/g, ' ')", ".replace(/<[^>]+>/g, '')"],
  ['não limita as quebras', ".replace(/\\n{3,}/g, '\\n\\n')", ''],
  ['espaço em volta da quebra fica', ".replace(/ ?\\n ?/g, '\\n')", ''],
  ['sem trim', '    .trim()\n', '\n'],
]
for (const [nome, de, para] of mutsHelper) {
  if (HELPER_SRC.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
  let fm
  try { fm = bateriaHelper(carregar(HELPER_SRC.replace(de, () => para), 'mut')) } catch (e) { fm = ['erro: ' + e.message] }
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0 && !fm[0].startsWith('erro'), 'sobreviveu ou quebrou por exceção')
}
const mutsTela = [
  ['edição abre achatada', TELA.replace('setTextoEdicao(textoDoComentario(c.message))', "setTextoEdicao(c.message.replace(/\\s+/g, ' '))")],
  ['salvar compara com o cru', TELA.replace('message === textoDoComentario(c.message)', 'message === c.message')],
  ['corpo cru', TELA.replace('{textoDoComentario(c.message)}', '{c.message}')],
  ['original cru', TELA.replace('{textoDoComentario(c.texto_original)}', '{c.texto_original}')],
  ['patch manda o texto original', TELA.replace('JSON.stringify({ message })', 'JSON.stringify({ message: c.message })')],
]
for (const [nome, mut] of mutsTela) {
  if (mut === TELA) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateriaTela(mut)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
