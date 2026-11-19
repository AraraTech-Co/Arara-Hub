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
// - GET /resumo: a leitura `{ arquivado: false }` e o `if (c.arquivado === true) continue;`
//   são o mesmo recorte duas vezes; tirar um só não muda nenhuma contagem (o outro garante).
//   A leitura filtrada fica pelo custo; a checagem em memória, como defesa.
// - GET /resumo, Kanban com leitura incompleta: não calcular `valores` e o `ind()` só publicar valor com
//   estado "ok" são a mesma garantia duas vezes; tirar uma só não publica número (a outra segura).
//   O `ok &&` do `ind()` é equivalente hoje: todo indicador que não está "ok" chega sem valor numérico
//   (corpo da fonte ausente, `mv`/`valores` nulos, ou indicador montado sem valor). Fica como defesa.
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
  ['url: aceita usuário/senha', 'if (u.username || u.password) return', 'if (false) return'],
  ['idempotência: devolve cartão alheio', 'if (existentes[0].criado_por !== g.pessoa.id) {', 'if (false) {'],
  ['resumo: período inclui o fim', 'dia >= inicio && dia < fim', 'dia >= inicio && dia <= fim'],
  ['resumo: período em UTC', 'var dia = _dataSP(dt);', 'var dia = dt.toISOString().slice(0, 10);'],
  ['resumo: concluído sem status concluído', "if (c.status === 'concluido' && c.concluido_em) {", 'if (c.concluido_em) {'],
  ['resumo: dezembro não vira o ano', "(m === 12 ? ano + 1 + '-01' :", "(m === 12 ? ano + '-13' :"],
  ['resumo: aceita mês 13', 'mm < 1 || mm > 12', 'mm < 1'],
  ['resumo: falha vira zero', "    estado = 'erro';\n    motivo = 'falha_leitura';\n    valores = null;\n  }\n  var indicadores", "    valores = { 'kanban.para_decidir': 0, 'kanban.em_andamento': 0, 'kanban.aguardando': 0, 'kanban.concluidos_periodo': 0, 'kanban.vencidos': 0 };\n  }\n  var indicadores"],
  ['resumo: snapshot no período', 'snapshot_at: !per && ok ? agora : null,', 'snapshot_at: agora,'],
  // ── resumo: leitura das fontes (fatias 4–6) ──
  ['fontes: 403 vira erro', 'if (res.status === 401 || res.status === 403) return', 'if (res.status === 401) return'],
  ['fontes: 404 vira erro', "if (res.status === 404) return { motivo: 'fonte_nao_configurada' };", ''],
  ['fontes: aceita truncado', ' || res.truncated) return', ') return'],
  ['fontes: aceita leitura incompleta', 'corpo.complete !== true', 'false'],
  ['fontes: allowlist vira erro', '/allowlist|ALLOWLIST/.test(msg)', 'false'],
  ['vendas: percentual sem meta', "var temMeta = rv.corpo && typeof vc.meta === 'number' && vc.meta > 0;", 'var temMeta = rv.corpo;'],
  ['horas: média sem analistas vira 0', 'hc.avg_approved_minutes_per_analyst == null', 'false'],
  // ── rota no Suporte ──
  ['suporte: conta arquivado', 'if (t.is_archived === true) continue;', '', 'portal-suporte'],
  ['suporte: conta quadro dev', 'if (String(t.quadro || "suporte") !== "suporte") continue;', '', 'portal-suporte'],
  ['suporte: ignora assignedTo', 'if (!(t.assigned_to || t.assignedTo)) semResp += 1;', 'if (!t.assigned_to) semResp += 1;', 'portal-suporte'],
  ['suporte: criados em UTC', 'diaSP(c).slice(0, 7) === mes', 'String(c).slice(0, 7) === mes', 'portal-suporte'],
  ['suporte: lê um lote só', 'if (linhas.length < LOTE) { completo = true; break; }', '{ completo = true; break; }', 'portal-suporte'],
  ['suporte: aceita mês 13', '(0[1-9]|1[0-2])', '\\d{2}', 'portal-suporte'],
  // ── rota no Horas ──
  ['horas: 403 some', "if (!admin) return ctx.reply.status(403).send({ error: 'Admin only' });", '', 'portal-horas'],
  ['horas: conta admin', 'if (uid && adminIds[String(uid)]) continue;', '', 'portal-horas'],
  ['horas: admin inativo sai', "if (pf.active !== false && pf.role === 'admin')", "if (pf.role === 'admin')", 'portal-horas'],
  ['horas: ignora ADJUSTED', "if (st === 'APPROVED' || st === 'ADJUSTED')", "if (st === 'APPROVED')", 'portal-horas'],
  ['horas: ignora mês', "if (String(e.date || '').indexOf(month) !== 0) continue;", '', 'portal-horas'],
  ['horas: lê um lote só', 'if (linhas.length < LOTE) return { itens: itens, completo: true };', 'return { itens: itens, completo: true };', 'portal-horas'],
  ['horas: analista só se aprovado', "    analistas[String(uid || e.analyst_email || e.analystEmail || '?')] = true;\n", '', 'portal-horas'],
  // ── rota no CRM ──
  ['crm: fechamento em UTC', 'if (mesSP(d.closedAt) !== mes) continue', 'if (String(d.closedAt).slice(0, 7) !== mes) continue', 'crm'],
  ['crm: conta não ganho', "if (d.status !== 'won') continue", '', 'crm'],
  ['crm: meta mais antiga vence', 'if (!uid || metaPorVendedor.has(uid)) continue', 'if (!uid) continue', 'crm'],
  ['crm: meta de outro mês', 'if (Number(g.periodMonth) !== m || Number(g.periodYear) !== ano) continue', 'if (Number(g.periodYear) !== ano) continue', 'crm'],
  ['crm: lê um lote só', 'if (pagina.length < LOTE) return { itens, completo: true }', 'return { itens, completo: true }', 'crm'],
  ['crm: 401 some', "if (!idDaPessoa(ctx)) return ctx.reply.status(401).send({ error: 'Auth necessaria' })", '', 'crm'],
  ['crm: meta zero vira meta', 'meta: meta > 0 ?', 'meta: meta >= 0 ?', 'crm'],
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

// Fontes externas: só o literal da rota nova é mutado (o resto do arquivo é de outros apps).
const EXTERNOS = {
  'portal-suporte': { arq: path.resolve(AQUI, '../../../src/apps/portal-suporte/routes.generated.ts'), rota: '/tickets/resumo-gestao', env: 'CG_GEN_PORTAL_SUPORTE' },
  'portal-horas': { arq: path.resolve(AQUI, '../../../src/apps/portal-horas/routes.generated.ts'), rota: '/hour-entries/resumo', env: 'CG_GEN_PORTAL_HORAS' },
  crm: { arq: path.resolve(AQUI, '../../../src/apps/portal-crm/resumo-gestao.ts'), env: 'CG_CRM_TS', texto: true },
};
const ORIGINAIS = Object.fromEntries(Object.entries(EXTERNOS).map(([k, v]) => [k, fs.readFileSync(v.arq, 'utf8')]));

function mutar(texto, de, para, soRota) {
  let total = 0;
  let rotaAtual = '';
  const linhas = texto.split('\n').map((line) => {
    const pm = line.match(/^    path:\s*"([^"]*)"/);
    if (pm) rotaAtual = pm[1];
    if (!line.startsWith('    handler: compileController(')) return line;
    if (soRota && rotaAtual !== soRota) return line;
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
for (const [nome, de, para, onde] of MUTANTES) {
  let texto, total, env;
  if (!onde) {
    ({ texto, total } = mutar(ORIGINAL, de, para));
    env = { CG_GEN: path.join(tmp, 'routes.generated.ts') };
    if (total) fs.writeFileSync(env.CG_GEN, texto);
  } else {
    const e = EXTERNOS[onde];
    if (e.texto) {
      total = ORIGINAIS[onde].split(de).length - 1;
      texto = ORIGINAIS[onde].split(de).join(para);
    } else ({ texto, total } = mutar(ORIGINAIS[onde], de, para, e.rota));
    const alvoExt = path.join(tmp, path.basename(e.arq));
    if (total) fs.writeFileSync(alvoExt, texto);
    env = { [e.env]: alvoExt };
  }
  if (!total) { naoAplicados.push(nome); continue; }
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...arquivos], { env: { ...process.env, ...env }, encoding: 'utf8' });
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
for (const [k, v] of Object.entries(EXTERNOS)) if (fs.readFileSync(v.arq, 'utf8') !== ORIGINAIS[k]) throw new Error('o arquivo real mudou: ' + k);
console.log(`\nmutantes: ${MUTANTES.length} · aplicados: ${MUTANTES.length - naoAplicados.length} · mortos: ${mortos} · vivos: ${vivos.length}`);
if (naoAplicados.length) console.log('NÃO aplicados: ' + naoAplicados.join(' | '));
process.exit(vivos.length || naoAplicados.length ? 1 : 0);
