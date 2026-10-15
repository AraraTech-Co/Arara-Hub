// O campo "Área que assume" do cartão Atendente sai da tela — e o dado dos
// fluxos que já o têm continua gravado e funcionando.
//
// Por que o campo saiu: ele era gravado e NINGUÉM o lia. Zero leituras no
// motor do fluxo e no simulador; as únicas ocorrências no servidor são valores
// dentro dos fluxos-modelo. Quem escolhia "Vendas" acreditava estar
// encaminhando a conversa para o setor, e ela ia para o rodízio de sempre.
// A tela prometia um comportamento que não existe.
//
// Encaminhar DE VERDADE é entrega nova, com risco de mudar quem atende, e foi
// deixada fora de propósito.
//
// Este teste tem duas metades, e as duas importam:
//  1. a tela não oferece mais o campo — conferido no código publicado, porque
//     o editor é componente React e aqui não há como renderizá-lo;
//  2. fluxo com `area` continua VALENDO — conferido rodando o validador de
//     verdade, o mesmo que o salvar e o publicar usam.
//
// Roda com: node area-do-atendente-fora-da-tela.test.js
const fs = require('node:fs')
const path = require('node:path')
const { ok, fim } = require('./_carregar.js')

const APP = path.resolve(__dirname, '../..')
const { validarGrafo } = require(path.join(APP, 'app/lib/wa-flow-graph.ts'))

const editor = fs.readFileSync(path.join(APP, 'app/_components/wa-flow/flow-card-editor.tsx'), 'utf8')
const tela = fs.readFileSync(path.join(APP, 'app/_components/wa-flow/flow-editor.tsx'), 'utf8')

/** Um fluxo mínimo e válido, com o cartão Atendente. */
function fluxo(dataDoAtendente) {
  return {
    root: 'm1',
    nodes: [
      { id: 'm1', type: 'content', position: { x: 0, y: 0 }, data: { text: 'Olá' } },
      { id: 'at', type: 'handoff', position: { x: 0, y: 120 }, data: dataDoAtendente },
    ],
    edges: [{ id: 'e1', source: 'm1', target: 'at', sourceHandle: 'next' }],
  }
}

;(async () => {
  // ══ 1. a tela não oferece mais o campo ════════════════════════════════
  // O rótulo não é procurado como texto solto: o comentário que EXPLICA a
  // remoção contém a mesma frase, e a afirmação casaria com ele. O que prova a
  // saída do campo são os marcadores de interface — o id do seletor e as
  // opções, que não existem em comentário nenhum.
  ok('as opções de setor saíram do editor de cartão',
    !editor.includes('<option value="administrativo">') && !editor.includes('<option value="vendas">'),
    'ainda há <option> de setor em flow-card-editor.tsx')
  ok('  o seletor card-area saiu', !editor.includes('card-area'), 'ainda presente')
  ok('  e nada na tela escreve `area`',
    !/onChange\(\{\s*area:/.test(editor), 'ainda há onChange({ area: ... })')
  ok('cartão Atendente NOVO não nasce mais com area',
    /handoff:\s*\{[^}]*data:\s*\{\s*\}/.test(tela), 'o padrão do handoff ainda traz data com conteúdo')

  // ══ 2. fluxo que JÁ TEM area continua valendo ═════════════════════════
  //
  // É a metade que protege o cliente: há fluxos publicados com `area`
  // gravado, e eles não podem passar a ser recusados no salvar nem no
  // publicar por causa de uma mudança de tela.
  {
    const r = validarGrafo(fluxo({ text: 'Vou te encaminhar.', area: 'suporte' }))
    ok('fluxo antigo com area="suporte": válido', r.ok === true, r)
  }
  {
    const r = validarGrafo(fluxo({ text: 'Vou te encaminhar.', area: 'vendas' }))
    ok('fluxo antigo com area="vendas": válido', r.ok === true, r)
  }
  {
    // Valor que a tela nunca ofereceu, vindo de importação de JSON.
    const r = validarGrafo(fluxo({ text: 'Vou te encaminhar.', area: 'qualquer-coisa' }))
    ok('area com valor desconhecido: ainda válido, não é campo validado', r.ok === true, r)
  }
  {
    const r = validarGrafo(fluxo({ text: 'Vou te encaminhar.' }))
    ok('cartão novo SEM area: válido', r.ok === true, r)
  }

  // ══ 3. o dado sobrevive a abrir, editar e salvar ══════════════════════
  //
  // Garantido por duas linhas do editor, e é nelas que a afirmação se apoia:
  // o patch espalha o `data` existente, e o salvar serializa `n.data` inteiro.
  // Não há como renderizar o componente aqui, então o que se confere é a
  // presença dessas duas formas — reescrevê-las em outra forma passaria sem
  // ninguém notar que o `area` começou a ser descartado.
  ok('o patch do cartão espalha o data existente',
    /data:\s*\{\s*\.\.\.\(n\.data as object\),\s*\.\.\.patch\s*\}/.test(tela),
    'o patchNode não espalha mais o data anterior')
  ok('  e o salvar serializa o data inteiro',
    /data:\s*n\.data as WAGraphNode\['data'\]/.test(tela),
    'o currentGraph não serializa mais n.data cru')

  // ══ 4. o tipo continua aceitando area ═════════════════════════════════
  const tipos = fs.readFileSync(path.join(APP, 'app/lib/wa-flow-graph.ts'), 'utf8')
  ok('o tipo ainda aceita area, para o dado antigo não virar erro de tipo',
    /area\?:\s*string/.test(tipos), 'area saiu do tipo')

  fim()
})().catch((e) => { console.error('ERRO NO TESTE:', e); process.exit(1) })
