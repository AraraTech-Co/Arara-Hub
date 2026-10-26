// A hora do "(desde …)" no aviso ao plantonista é a do relógio da EMPRESA, não a de UTC.
//
// A mensagem montava a hora com `String(aguardando_desde).slice(11, 16)`: cortava o ISO em UTC (`...Z`) e
// escrevia a hora de Greenwich, três horas à frente de Brasília ("desde as 11" para quem esperava desde as 08).
//
// O QUE SE GARANTE:
//   - `_avHora(iso, fuso)` (dentro do bloco de configuração de avisos, executada): 11:00Z → "08:00" em
//     America/Sao_Paulo; 02:30Z → "23:30" (o dia anterior); o fuso informado manda (Manaus -04, Auckland +13);
//     vazio, nulo e lixo → "" (o "(desde …)" some, como antes); ISO sem designador é lido como UTC; o resultado
//     NÃO depende do fuso do processo (rodado com TZ = UTC, Sao_Paulo, Auckland);
//   - o bloco continua IDÊNTICO nas seis rotas (cobertura em `config-de-avisos`);
//   - as quatro montagens da mensagem (entrada e varredura, lista e linha única) passam pelo helper com o fuso
//     que a própria rota já resolve (nenhum `slice(11, 16)` sobrou, nenhum "America/Sao_Paulo" novo);
//   - o texto REAL das duas rotas, com a hora do relato, sai "desde 08:00" (em `config-de-avisos`).
// MUTAÇÕES: aplicadas uma vez cada, reprovadas por asserção.
//
// Roda com: node hora-do-aviso-no-fuso.test.js
const fs = require('fs')
const { ok, fim, ARQ } = require('./_carregar.js')

function codigoDe(marca) {
  const s = fs.readFileSync(ARQ, 'utf8')
  const at = s.indexOf(marca)
  if (at < 0) throw new Error('rota ausente: ' + marca)
  const re = /compileController\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g
  re.lastIndex = at
  return JSON.parse('"' + re.exec(s)[1] + '"')
}
const ENTRADA = codigoDe('485 whatsapp POST /whatsapp/inbound')
const VARREDURA = codigoDe('490m whatsapp POST /whatsapp/plantao/varrer')
const INI = '// ── Configuração de avisos (21/10/2026)'
const FIM = '// ── fim da configuração de avisos'
const bloco = (cod) => { const i = cod.indexOf(INI), f = cod.indexOf(FIM); return i < 0 || f < 0 ? null : cod.slice(i, f) }
const hora = (blocoCodigo) => new Function(blocoCodigo + '\n' + FIM + '\nreturn _avHora')()

function bateria(avHora) {
  const f = []
  const t = (nome, got, esperado) => { if (got !== esperado) f.push(nome + ' → ' + JSON.stringify(got)) }
  for (const tz of ['UTC', 'America/Sao_Paulo', 'Pacific/Auckland']) {
    process.env.TZ = tz
    const sp = 'America/Sao_Paulo'
    t(tz + ':relato-11Z', avHora('2026-10-12T11:00:00Z', sp), '08:00')
    t(tz + ':relato-11Z-com-ms', avHora('2026-10-12T11:00:00.000Z', sp), '08:00')
    t(tz + ':dia-anterior', avHora('2026-10-13T02:30:00Z', sp), '23:30')
    t(tz + ':meia-noite', avHora('2026-10-13T03:00:00Z', sp), '00:00')
    t(tz + ':offset-no-ISO', avHora('2026-10-12T11:00:00-03:00', sp), '11:00')
    t(tz + ':manaus', avHora('2026-10-12T21:00:00Z', 'America/Manaus'), '17:00')
    t(tz + ':auckland', avHora('2026-10-12T11:00:00Z', 'Pacific/Auckland'), '00:00')
    t(tz + ':utc-pedido', avHora('2026-10-12T11:00:00Z', 'UTC'), '11:00')
    t(tz + ':sem-designador-e-UTC', avHora('2026-10-12T11:00:00', sp), '08:00')
    t(tz + ':vazio', avHora('', sp), '')
    t(tz + ':nulo', avHora(null, sp), '')
    t(tz + ':indefinido', avHora(undefined, sp), '')
    t(tz + ':lixo', avHora('ontem', sp), '')
    t(tz + ':fuso-invalido', avHora('2026-10-12T11:00:00Z', 'Nao/Existe'), '')
  }
  process.env.TZ = 'America/Sao_Paulo'
  return f
}

const blocoE = bloco(ENTRADA), blocoV = bloco(VARREDURA)
ok('o bloco de configuração (com o helper) está nas duas rotas que montam a frase, e é o mesmo', !!blocoE && blocoE === blocoV && /function _avHora\(/.test(blocoE), blocoE && blocoE.length)
const f0 = bateria(hora(blocoE))
ok('_avHora dá a hora do relógio da empresa, em qualquer fuso do processo', f0.length === 0, f0)

// as montagens
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
const sitios = (cod0, fusoEsperado) => {
  const cod = semComentarios(cod0)
  const f = []
  if (/slice\(11, ?16\)/.test(cod)) f.push('sobrou-slice')
  const n = (cod.match(new RegExp('_avHora\\([^)]*aguardando_desde, ' + fusoEsperado.replace(/[().]/g, '\\$&') + '\\)', 'g')) || []).length
  if (n !== 2) f.push('montagens-com-helper-e-fuso-certo=' + n)
  // a função nova não fixa o fuso
  const corpo = (bloco(cod) || '').split('function _avHora')[1] || ''
  if (/America\/Sao_Paulo/.test(corpo.split('\n}\n')[0] || '')) f.push('fuso-fixo-no-helper')
  return f
}
const sE = () => sitios(ENTRADA, '_horarioConfig().fuso')
const sV = () => sitios(VARREDURA, 'fuso')
ok('entrada: as duas montagens usam o helper com o fuso da configuração da rota', sE().length === 0, sE())
ok('varredura: as duas montagens usam o helper com o fuso da configuração da rota', sV().length === 0, sV())

const mutsHelper = [
  ['volta ao corte do texto', 'var t = new Date(/(?:[zZ]|[+-]\\d{2}:?\\d{2})$/.test(cru) ? cru : cru + "Z").getTime();', 'return cru.slice(11, 16);\n  var t = 0;'],
  ['fixa UTC', 'timeZone: fuso,', 'timeZone: "UTC",'],
  ['fixa São Paulo e ignora o fuso informado', 'timeZone: fuso,', 'timeZone: "America/Sao_Paulo",'],
  ['relógio de 12 horas', 'hourCycle: "h23"', 'hourCycle: "h12"'],
  ['meia-noite como 24', 'hourCycle: "h23"', 'hourCycle: "h24"'],
  ['sem designador lido como horário do servidor', '? cru : cru + "Z")', '? cru : cru)'],
  // Sem mutação para "tirar a guarda de data ilegível": `new Date(NaN)` faz o Intl lançar e o catch devolve ""
  // do mesmo jeito — equivalente por LÓGICA (a guarda só torna o caminho explícito), não por dado.
  ['data ilegível devolve algo', 'if (isNaN(t)) return "";', 'if (isNaN(t)) return "00:00";'],
  ['erro do Intl devolve algo', '} catch (e) { return ""; }', '} catch (e) { return "00:00"; }'],
  ['fuso inválido estoura', '} catch (e) { return ""; }', '} catch (e) { throw e; }'],
]
for (const [nome, de, para] of mutsHelper) {
  if (blocoE.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, 'âncora'); continue }
  let fm
  try { fm = bateria(hora(blocoE.replace(de, () => para))) } catch (e) { fm = ['erro: ' + e.message] }
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
const mutsSitios = [
  ['entrada: 1ª montagem volta ao corte', ENTRADA, '_avHora(c.aguardando_desde, _horarioConfig().fuso)', 'String(c.aguardando_desde || "").slice(11, 16)', sE, 'E'],
  ['entrada: 2ª montagem volta ao corte', ENTRADA, '_avHora(conversas[0].aguardando_desde, _horarioConfig().fuso)', 'String(conversas[0].aguardando_desde || "").slice(11, 16)', sE, 'E'],
  ['entrada: fuso fixo', ENTRADA, '_avHora(c.aguardando_desde, _horarioConfig().fuso)', '_avHora(c.aguardando_desde, "America/Sao_Paulo")', sE, 'E'],
  ['varredura: 1ª montagem volta ao corte', VARREDURA, '_avHora(c2.aguardando_desde, fuso)', 'String(c2.aguardando_desde || "").slice(11, 16)', sV, 'V'],
  ['varredura: 2ª montagem volta ao corte', VARREDURA, '_avHora(esperando[0].aguardando_desde, fuso)', 'String(esperando[0].aguardando_desde || "").slice(11, 16)', sV, 'V'],
  ['varredura: fuso fixo', VARREDURA, '_avHora(esperando[0].aguardando_desde, fuso)', '_avHora(esperando[0].aguardando_desde, "America/Sao_Paulo")', sV, 'V'],
]
for (const [nome, cod, de, para, , qual] of mutsSitios) {
  if (cod.split(de).length - 1 !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, cod.split(de).length - 1); continue }
  const mut = cod.replace(de, () => para)
  const fm = sitios(mut, qual === 'E' ? '_horarioConfig().fuso' : 'fuso')
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
