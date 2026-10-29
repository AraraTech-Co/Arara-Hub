// Carregar um módulo `.ts` da tela para TESTAR O COMPORTAMENTO dele.
//
// O Node 26 apaga os tipos, mas não resolve o que o `tsc` resolve: import
// relativo sem extensão e `import cfg from '...json'` sem atributo. Estes dois
// ganchos fazem só isso.
//
// Mora num arquivo só porque dois testes já precisam dele — e duas cópias de um
// carregador é como uma delas fica para trás quando o Node muda de regra.
//
// `variantes` permite servir o MESMO arquivo com uma alteração mínima (por
// exemplo uma constante virada), que é o único jeito de provar o
// comportamento de uma constante de módulo. A alteração NÃO lança quando não
// casa: quem reprova é uma asserção nomeada no teste, senão o arquivo morre
// antes de qualquer caso rodar e a saída não diz qual regra quebrou.
const fs = require('node:fs')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { registerHooks } = require('node:module')

/**
 * @param variantes [{ marca, de, para }] — quando a url contém `marca`, o
 *   arquivo é servido com `de` trocado por `para` (só se `de` aparecer 1×).
 */
function registrarTS(variantes = []) {
  registerHooks({
    resolve(esp, ctx, proximo) {
      if (/^\.{1,2}\//.test(esp) && !path.extname(esp) && ctx.parentURL) {
        const base = path.dirname(ctx.parentURL.replace('file://', ''))
        const alvo = path.resolve(decodeURIComponent(base), esp + '.ts')
        if (fs.existsSync(alvo)) return { url: pathToFileURL(alvo).href, shortCircuit: true }
      }
      return proximo(esp, ctx)
    },
    load(url, ctx, proximo) {
      const v = variantes.find((x) => url.includes(x.marca))
      if (v) {
        const arq = decodeURIComponent(url.split('?')[0].replace('file://', ''))
        const fonte = fs.readFileSync(arq, 'utf8')
        const trocado = fonte.split(v.de).length - 1 === 1
          ? fonte.replace(v.de, v.para)
          : fonte
        return { format: 'module-typescript', source: trocado, shortCircuit: true }
      }
      if (url.endsWith('.json')) {
        const texto = fs.readFileSync(decodeURIComponent(url.replace('file://', '')), 'utf8')
        return { format: 'module', source: 'export default ' + texto, shortCircuit: true }
      }
      return proximo(url, ctx)
    },
  })
}

const APP = path.resolve(__dirname, '../../app')

/** Importa um `.ts` da tela. `marca` acrescenta a query da variante. */
function importarTela(relativo, marca) {
  const url = pathToFileURL(path.join(APP, relativo)).href + (marca ? '?' + marca : '')
  return import(url)
}

/** O texto de um arquivo da tela SEM comentários — comentário que explica a
 *  decisão cita os mesmos nomes que a busca procura, e acharia a palavra sem
 *  que o código a use. */
function semComentarios(relativo) {
  return fs.readFileSync(path.join(APP, relativo), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n')
}

module.exports = { registrarTS, importarTela, semComentarios, APP }
