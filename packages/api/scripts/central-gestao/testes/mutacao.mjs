// Mutação no literal GERADO: cada mutante troca um trecho do código decodificado
// (em todas as rotas que o contêm), recodifica com JSON.stringify, grava uma cópia
// em $TMPDIR e roda a suíte com CG_GEN apontando para ela. O mutante tem de morrer
// numa asserção com nome. O arquivo real nunca é tocado.
//   node scripts/central-gestao/testes/mutacao.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { GEN } from './_carregar.mjs';

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const ORIGINAL = fs.readFileSync(GEN, 'utf8');

// Equivalentes, provados pela lógica e por isso fora da lista:
// - GET /cartoes `if ((c.arquivado === true) !== arquivados) continue;` e GET /membros
//   `if (p.active !== true) continue;`: a leitura já filtra por igualdade EXATA
//   (`{ arquivado: <bool> }`, `{ active: true }`), então a condição é sempre falsa.
//   Ficam como defesa caso a leitura mude.
const MUTANTES = [
  ['guarda: aceita chave sem pessoa', "if (!u || typeof u.id !== 'string' || !u.id) {", 'if (false) {'],
  ['guarda: ignora Profile inativo', "if (!p || p.active !== true || String(p.id) !== u.id) {", 'if (!p || String(p.id) !== u.id) {'],
  ['guarda: aceita "true" texto', 'p.active !== true ||', '!p.active ||'],
  ['guarda: não confere o id do Profile', " || String(p.id) !== u.id) {\n    return { resposta: _erro(ctx, 403", ") {\n    return { resposta: _erro(ctx, 403"],
  ['guarda: falha de leitura vira 403', "return { resposta: _erro(ctx, 503, 'perfil_indisponivel'", "return { resposta: _erro(ctx, 403, 'perfil_indisponivel'"],
  ['guarda: 401 vira 403', "_erro(ctx, 401, 'sem_sessao'", "_erro(ctx, 403, 'sem_sessao'"],
  ['conflito: ignora versao', 'if (cur.versao !== b.versao) {', 'if (false) {'],
  ['arquivado: deixa editar', 'if (cur.arquivado === true) {\n    return _erro(ctx, 409', 'if (false) {\n    return _erro(ctx, 409'],
  ['idempotência: não procura a chave', 'if (existentes.length > 0) {', 'if (false) {'],
  ['título: aceita vazio', "if (titulo.valor == null || titulo.valor.length < 1) {", 'if (false) {'],
  ['título: aceita controle', "} else if (/[\\u0000-\\u001F\\u007F]/.test(s)) {", '} else if (false) {'],
  ['texto: aceita não-string', "if (typeof v !== 'string') return { erro: campo + ' deve ser texto.' };", ''],
  ['texto: não aplica teto', 'if (s.length > max) return', 'if (false) return'],
  ['multilinha: não limpa controle', "s = s.replace(/[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]/g, '');", ''],
  ['url: aceita protocolo qualquer', "if (u.protocol !== 'https:' || !u.hostname)", 'if (!u.hostname)'],
  ['url: aceita espaço', "if (/\\s/.test(t.valor)) return", 'if (false) return'],
  ['prazo: aceita data inexistente', 'if (dt.getUTCFullYear() !== a || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {', 'if (false) {'],
  ['vencido: inclui hoje', 'c.prazo < hoje', 'c.prazo <= hoje'],
  ['vencido: conta concluído', " && c.status !== 'concluido' && c.arquivado !== true", " && c.arquivado !== true"],
  ['vencido: conta arquivado', " && c.arquivado !== true;\n}", ";\n}"],
  ['reabrir: mantém concluido_em', "} else if (antes.status === 'concluido') {", '} else if (false) {'],
  ['concluir: não grava concluido_em', "if (depois.status === 'concluido') {", 'if (false) {'],
  ['responsável: aceita inativo', "if (!p || p.active !== true || String(p.id) !== v) return", 'if (!p) return'],
  ['lista: filtro da camada invertido', "_lerTodos(ctx.models.Cartao, { arquivado: arquivados })", "_lerTodos(ctx.models.Cartao, { arquivado: !arquivados })"],
  ['lista: lê só um lote', 'if (linhas.length < LOTE) return { itens: itens, completo: true };', 'return { itens: itens, completo: true };'],
  ['lista: página de 500', 'var PAGINA = 200;', 'var PAGINA = 500;'],
  ['lista: ignora busca', "if (termo && _norm(c.titulo).indexOf(termo) < 0) continue;", ''],
  ['lista: ignora status', 'if (status && c.status !== status) continue;', ''],
  ['lista: "nenhum" ignorado', "if (responsavel === 'nenhum') {\n      if (c.responsavel_id) continue;\n    } else ", ''],
  ['lista: sem prazo primeiro', 'if (a.prazo && !b.prazo) return -1;\n    if (!a.prazo && b.prazo) return 1;', 'if (a.prazo && !b.prazo) return 1;\n    if (!a.prazo && b.prazo) return -1;'],
  ['lista: prazo mais distante primeiro', 'return a.prazo < b.prazo ? -1 : 1;', 'return a.prazo < b.prazo ? 1 : -1;'],
  ['patch: grava sem mudança', 'if (!mudou) return', 'if (false) return'],
  ['patch: não aumenta versão', 'versao: cur.versao + 1 };', 'versao: cur.versao };'],
  ['evento: falha some', 'if (!ok) corpo.historico_incompleto = true;', ''],
  ['eventos: ordem da camada', 'for (var i = r.itens.length - 1; i >= 0; i--) {', 'for (var i = 0; i < r.itens.length; i++) {'],
  ['eventos: não confere o cartão', "if (!cur) return _erro(ctx, 404, 'nao_encontrado', 'Cartão não encontrado.');\n  if (!ctx.models.CartaoEvento)", "if (!ctx.models.CartaoEvento)"],
];

function mutar(texto, de, para) {
  let total = 0;
  const linhas = texto.split('\n').map((line) => {
    if (!line.startsWith('    handler: compileController(')) return line;
    const i = line.indexOf('"');
    const j = line.lastIndexOf('"');
    const code = JSON.parse(line.slice(i, j + 1));
    const n = code.split(de).length - 1;
    if (!n) return line;
    total += n;
    return line.slice(0, i) + JSON.stringify(code.split(de).join(para)) + line.slice(j + 1);
  });
  return { texto: linhas.join('\n'), total };
}

const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'cg-mut-'));
const arquivos = fs.readdirSync(AQUI).filter((f) => f.endsWith('.test.mjs')).map((f) => path.join(AQUI, f));
let mortos = 0;
const vivos = [];
const naoAplicados = [];
for (const [nome, de, para] of MUTANTES) {
  const { texto, total } = mutar(ORIGINAL, de, para);
  if (!total) { naoAplicados.push(nome); continue; }
  const alvo = path.join(tmp, 'routes.generated.ts');
  fs.writeFileSync(alvo, texto);
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...arquivos], { env: { ...process.env, CG_GEN: alvo }, encoding: 'utf8' });
  const falhas = [...r.stdout.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1]).filter((n) => !n.endsWith('.mjs'));
  if (r.status !== 0 && falhas.length) {
    mortos += 1;
    console.log(`morto  (${total}x) ${nome}  ← ${falhas[0]}`);
  } else {
    vivos.push(nome);
    console.log(`VIVO   (${total}x) ${nome}${r.status !== 0 ? ' (falhou sem asserção com nome)' : ''}`);
  }
}
fs.rmSync(tmp, { recursive: true, force: true });
if (fs.readFileSync(GEN, 'utf8') !== ORIGINAL) throw new Error('o arquivo real mudou!');
console.log(`\nmutantes: ${MUTANTES.length} · aplicados: ${MUTANTES.length - naoAplicados.length} · mortos: ${mortos} · vivos: ${vivos.length}`);
if (naoAplicados.length) console.log('NÃO aplicados: ' + naoAplicados.join(' | '));
process.exit(vivos.length || naoAplicados.length ? 1 : 0);
