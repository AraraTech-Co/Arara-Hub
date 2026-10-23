// A tela avisa quando a mensagem saiu SEM a citação.
//
// `POST /whatsapp` devolve `citacao_nao_enviada: true` quando corta a citação (mensagem citada com id
// provisório `local_…`). O composer ignorava a bandeira: o atendente via a citação na própria bolha e achava
// que o cliente a recebeu.
//
// O QUE SE GARANTE:
//   - O HELPER (`lib/inbox/aviso-de-citacao.ts`, executado de verdade): com `citacao_nao_enviada === true` e a
//     mensagem entregue devolve o texto do aviso; sem a bandeira, com a bandeira falsa/ausente/não booleana, sem
//     dados, ou com a entrega falha (`entregue: false`), devolve null;
//   - O COMPOSER (texto, sem comentários): chama o helper com os dados do envio, mostra um banner de AVISO
//     dispensável (não é erro e não é toast), limpa o aviso ao começar outro envio e ao trocar de conversa,
//     e a resposta do envio é tipada com a bandeira.
//   - O AVISO É EFÊMERO: não há gravação dele (nada em localStorage/sessionStorage, nada enviado ao servidor).
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node aviso-de-citacao-nao-enviada.test.js   (Node 22.18+/24+ carrega .ts sem build)
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../../app')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const HELPER_TS = path.join(APP, 'lib/inbox/aviso-de-citacao.ts')
const COMPOSER = semComentarios(fs.readFileSync(path.join(APP, '_components/inbox/composer.tsx'), 'utf8'))

// o helper: o `.ts` é gravado num temporário (para as mutações) e carregado pelo Node
function carregar(codigo, nome) {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aviso-'))
  const f = path.join(dir, nome + '.ts')
  fs.writeFileSync(f, codigo)
  const m = require(f)
  delete require.cache[f]
  return m
}
const HELPER_SRC = fs.readFileSync(HELPER_TS, 'utf8')

function bateriaHelper(m) {
  const f = []
  const a = m.avisoDeCitacao
  const TEXTO = m.AVISO_CITACAO_NAO_ENVIADA
  if (a({ citacao_nao_enviada: true, entregue: true }) !== TEXTO) f.push('bandeira-e-entregue')
  if (a({ citacao_nao_enviada: true }) !== TEXTO) f.push('bandeira-sem-entregue')
  if (a({ entregue: true }) !== null) f.push('sem-bandeira')
  if (a({ citacao_nao_enviada: false, entregue: true }) !== null) f.push('bandeira-falsa')
  if (a({ citacao_nao_enviada: 'true' }) !== null) f.push('bandeira-string')
  if (a({ citacao_nao_enviada: 1 }) !== null) f.push('bandeira-numero')
  if (a({}) !== null) f.push('objeto-vazio')
  if (a(null) !== null || a(undefined) !== null) f.push('sem-dados')
  if (a({ citacao_nao_enviada: true, entregue: false }) !== null) f.push('entrega-falhou')
  if (!/sem a cita/.test(TEXTO) || /local_|provis|id |JSON|null|undefined/i.test(TEXTO)) f.push('texto-de-atendente')
  return f
}

function bateriaComposer(c) {
  const f = []
  if (!/import \{ avisoDeCitacao \} from '@\/lib\/inbox\/aviso-de-citacao'/.test(c)) f.push('sem-import')
  if (!/setAviso\(avisoDeCitacao\(dados\)\)/.test(c)) f.push('nao-chama-o-helper-com-os-dados')
  if (!/citacao_nao_enviada\?: boolean/.test(c)) f.push('resposta-sem-a-bandeira-tipada')
  if (!/\{aviso && \(/.test(c) || !/role="status"/.test(c) || !/Entendi/.test(c) || !/onClick=\{\(\) => setAviso\(null\)\}/.test(c)) f.push('banner-dispensavel')
  if (!/sem-warning|sem-warning-bd/.test(c) && !/sem-warning/.test(c)) f.push('banner-nao-e-aviso')
  // limpa ao começar outro envio
  const iEnvio = c.indexOf('async function handleSend()')
  const iLimpa = c.indexOf('setAviso(null)', iEnvio)
  const iAwait = c.indexOf('await whatsappApi.sendMessage', iEnvio)
  if (iEnvio < 0 || iLimpa < 0 || iAwait < 0 || iLimpa > iAwait) f.push('nao-limpa-ao-enviar')
  // limpa ao trocar de conversa
  if (!/useEffect\(\(\) => \{ setAviso\(null\) \}, \[conversationId\]\)/.test(c)) f.push('nao-limpa-ao-trocar-de-conversa')
  // efêmero: nada de armazenamento nem toast
  if (/localStorage|sessionStorage/.test(c)) f.push('guarda-em-storage')
  if (/toast\(/.test(c) || /useToast/.test(c)) f.push('usa-toast')
  // o erro de entrega segue valendo (não foi trocado pelo aviso)
  if (!/Gravado no histórico, mas o WhatsApp não aceitou a entrega/.test(c)) f.push('perdeu-o-erro-de-entrega')
  return f
}

const hf = bateriaHelper(carregar(HELPER_SRC, 'helper'))
ok('o helper devolve o aviso só quando a citação foi cortada e a mensagem foi entregue', hf.length === 0, hf)
const cf = bateriaComposer(COMPOSER)
ok('o composer mostra o aviso dispensável, limpa ao enviar e ao trocar de conversa, e não o guarda', cf.length === 0, cf)

const mutsHelper = [
  ['sem a condição da bandeira', 'if (dados.citacao_nao_enviada !== true) return null', ''],
  ['condição invertida', 'if (dados.citacao_nao_enviada !== true) return null', 'if (dados.citacao_nao_enviada === true) return null'],
  ['bandeira "verdadeira" qualquer', 'if (dados.citacao_nao_enviada !== true) return null', 'if (!dados.citacao_nao_enviada) return null'],
  ['ignora a entrega', 'if (dados.entregue === false) return null', ''],
  ['avisa só quando NÃO entregue', 'if (dados.entregue === false) return null', 'if (dados.entregue !== false) return null'],
  ['sem checar dados nulos', 'if (!dados) return null', ''],
]
for (const [nome, de, para] of mutsHelper) {
  if (HELPER_SRC.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
  let fm
  try { fm = bateriaHelper(carregar(HELPER_SRC.replace(de, () => para), 'mut')) } catch (e) { fm = ['erro: ' + e.message] }
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
const mutsComposer = [
  ['o composer não chama o helper', COMPOSER.replace('setAviso(avisoDeCitacao(dados))', 'setAviso(null)')],
  ['o banner perde o botão de dispensar', COMPOSER.replace('onClick={() => setAviso(null)}', 'onClick={() => undefined}')],
  ['não limpa ao começar outro envio', COMPOSER.replace('    setSending(true)\n    setAviso(null)\n', '    setSending(true)\n')],
  ['não limpa ao trocar de conversa', COMPOSER.replace('useEffect(() => { setAviso(null) }, [conversationId])', '')],
  ['vira toast', COMPOSER + '\nconst t = useToast(); toast({ title: "x" })'],
  ['guarda em localStorage', COMPOSER + "\nlocalStorage.setItem('aviso', '1')"],
  ['o erro de entrega some', COMPOSER.replace('Gravado no histórico, mas o WhatsApp não aceitou a entrega', 'Falhou')],
  ['a bandeira não é tipada na resposta', COMPOSER.replace(/citacao_nao_enviada\?: boolean/g, 'x?: boolean')],
]
for (const [nome, mut] of mutsComposer) {
  if (mut === COMPOSER) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateriaComposer(mut)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
