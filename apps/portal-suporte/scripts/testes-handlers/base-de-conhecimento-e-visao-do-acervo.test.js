// A Base de Conhecimento (`/admin/kb`) é uma VISÃO do acervo de arquivos de apoio, presa a uma pasta fixa:
// sem rota nem modelo próprios, sem restrição de acesso oferecida na tela, e sem nenhuma chamada às rotas
// de artigo que saíram do servidor.
//
// Teste de TEXTO, e dito assim: lê os arquivos do front e afirma o que a tela usa e o que ela não usa.
// A prova de verdade é ver a tela em produção.
//   1. a pasta é UMA constante do acervo (`base-de-conhecimento`), usada na LISTAGEM e no ENVIO; não há
//      campo de pasta de destino;
//   2. a tela não oferece ACL (nível/grant) nem importa o que a oferece;
//   3. a tela não chama `kbApi` (nem o cliente tem mais list/getById/create/update/delete);
//   4. tipo e tamanho são conferidos ANTES de ler o arquivo (`motivoRecusaAnexo` antes de `lerDataUri`);
//   5. apagar só aparece para quem enviou ou para admin (o servidor confere de novo);
//   6. erro de listagem aparece (não vira lista vazia silenciosa);
//   7. `lib/api/kb.ts` só expõe `suggest`, e o assistente de chamado não usa mais a listagem de reserva.
// MUTAÇÕES: cada uma aplicada uma vez e reprovada por asserção.
//
// Roda com: node base-de-conhecimento-e-visao-do-acervo.test.js
const fs = require('fs')
const path = require('path')
const { ok, fim } = require('./_carregar.js')
const APP = path.resolve(__dirname, '../../app')
const ler = (p) => fs.readFileSync(path.join(APP, p), 'utf8')
const semComentarios = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const PAGINA = semComentarios(ler('(admin)/admin/kb/page.tsx'))
const ARQUIVOS = semComentarios(ler('lib/api/arquivos.ts'))
const KB = semComentarios(ler('lib/api/kb.ts'))
const SUGESTOES = semComentarios(ler('_components/kb/kb-suggestions.tsx'))

function bateria(pagina, arquivos, kb, sugestoes) {
  const f = []
  if (!/PASTA_BASE_DE_CONHECIMENTO\s*=\s*'base-de-conhecimento'/.test(arquivos)) f.push('pasta-nao-e-a-fixa')
  if (!/arquivosApi\.listar\(\s*PASTA_BASE_DE_CONHECIMENTO/.test(pagina)) f.push('listagem-sem-a-pasta-fixa')
  if (!/arquivosApi\.enviar\(\{[^}]*pasta:\s*PASTA_BASE_DE_CONHECIMENTO/.test(pagina)) f.push('envio-sem-a-pasta-fixa')
  if (/destino|setPasta|Pasta de destino/.test(pagina)) f.push('tem-campo-de-pasta')
  if (/acl_|NIVEIS_DE_ACESSO|FEATURE_GRANTS|acesso/i.test(pagina)) f.push('oferece-acl')
  if (/\bkbApi\b|lib\/api\/kb/.test(pagina)) f.push('chama-kbApi')
  const iRecusa = pagina.indexOf('motivoRecusaAnexo(file)'), iLer = pagina.indexOf('lerDataUri(file)')
  if (iRecusa < 0 || iLer < 0 || iRecusa > iLer) f.push('confere-depois-de-ler')
  if (!/ehAdmin\s*\|\|\s*\(!!user\?\.id\s*&&\s*d\.dono_id\s*===\s*user\.id\)/.test(pagina) || !/\{posso\s*&&/.test(pagina)) f.push('apagar-aberto-a-todos')
  if (!/catch\s*\(err\)\s*\{[\s\S]*?setErro\(/.test(pagina)) f.push('erro-silencioso')
  if (/\blist\b|getById|\bcreate\b|\bupdate\b|\bdelete\b/.test(kb)) f.push('kb-ainda-tem-metodo-de-artigo')
  if (!/suggest/.test(kb)) f.push('kb-sem-suggest')
  if (/kbApi\.list/.test(sugestoes)) f.push('sugestoes-usam-a-listagem-removida')
  return f
}

const f0 = bateria(PAGINA, ARQUIVOS, KB, SUGESTOES)
ok('a tela é uma visão do acervo, presa à pasta fixa, sem ACL e sem rotas de artigo', f0.length === 0, f0)
const muts = [
  ['a pasta deixa de ser a fixa', [PAGINA, ARQUIVOS.replace("'base-de-conhecimento'", "'outra'"), KB, SUGESTOES]],
  ['a listagem perde a pasta', [PAGINA.replace('arquivosApi.listar(PASTA_BASE_DE_CONHECIMENTO', 'arquivosApi.listar(null'), ARQUIVOS, KB, SUGESTOES]],
  ['o envio perde a pasta', [PAGINA.replace('pasta: PASTA_BASE_DE_CONHECIMENTO', 'pasta: ""'), ARQUIVOS, KB, SUGESTOES]],
  ['a tela ganha campo de pasta de destino', [PAGINA + '\nconst destino = ""', ARQUIVOS, KB, SUGESTOES]],
  ['a tela passa a oferecer ACL', [PAGINA.replace("pasta: PASTA_BASE_DE_CONHECIMENTO, conteudo", "pasta: PASTA_BASE_DE_CONHECIMENTO, conteudo, acl_nivel: 'admin'"), ARQUIVOS, KB, SUGESTOES]],
  ['a tela volta a chamar o kbApi', [PAGINA + "\nimport { kbApi } from '@/lib/api/kb'", ARQUIVOS, KB, SUGESTOES]],
  ['o tamanho é conferido depois de ler', [PAGINA.replace('const recusa = motivoRecusaAnexo(file)', 'const lido0 = await lerDataUri(file)\n const recusa = motivoRecusaAnexo(file)'), ARQUIVOS, KB, SUGESTOES]],
  ['apagar aparece para todos', [PAGINA.replace('const posso = ehAdmin || (!!user?.id && d.dono_id === user.id)', 'const posso = true'), ARQUIVOS, KB, SUGESTOES]],
  ['o erro da listagem some', [PAGINA.replace('setErro(err instanceof Error ? err.message : \'Não deu para listar os documentos.\')', ''), ARQUIVOS, KB, SUGESTOES]],
  ['o cliente kb ganha list de volta', [PAGINA, ARQUIVOS, KB + '\n  list: () => 0', SUGESTOES]],
  ['as sugestões usam a listagem removida', [PAGINA, ARQUIVOS, KB, SUGESTOES + '\nkbApi.list({})']],
]
for (const [nome, args] of muts) {
  const mudou = args.some((a, i) => a !== [PAGINA, ARQUIVOS, KB, SUGESTOES][i])
  if (!mudou) { ok(`mutação "${nome}" aplicou`, false, 'não mudou'); continue }
  const fm = bateria(...args)
  ok(`mutação "${nome}" é pega (${fm.slice(0, 1).join('')})`, fm.length > 0, 'sobreviveu')
}
fim()
