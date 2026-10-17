// O casamento de rota do runtime (src/lib/route-matcher.ts) é IGUAL ao de antes e
// constrói cada casador uma vez só.
//
// ANTES: a cada requisição, para cada rota do mesmo método, o runtime chamava
// `match(route.path, ...)` (que compila o caminho) e só então testava o caminho
// pedido. Com ~500 rotas, centenas de compilações por requisição.
// AGORA: um casador por caminho, guardado num mapa. As rotas são código do
// repositório e só mudam em deploy (que reinicia o processo): não há invalidação.
//
// O QUE SE PROVA:
//   - EQUIVALÊNCIA com o laço de antes (copiado aqui, com `match` a cada volta) sobre
//     as rotas REAIS do portal-suporte, com milhares de pedidos: mesma rota, mesmos
//     parâmetros (inclusive decodificados), mesma pontuação, ou ambos sem casamento;
//   - a regra de pontuação é exercida (há pedidos que casam com mais de uma rota);
//   - caminho malformado lança igual nos dois;
//   - o mapa tem um casador por caminho distinto e não cresce na segunda passada;
//     caminho de rota inválido continua lançando e não entra no mapa;
//   - MUTAÇÕES no módulo (cada uma aplicada uma vez) reprovam por asserção.
//
// Roda com (precisa de tsx, porque as rotas geradas importam `.js` de arquivos `.ts`):
//   npx tsx scripts/testes/route-matcher.test.mjs
import fs from 'node:fs';
import { match } from 'path-to-regexp';
import { PortalSuporteRoutes } from '../../src/apps/portal-suporte/routes.generated.ts';

const ORIGINAL = new URL('../../src/lib/route-matcher.ts', import.meta.url);
const MUTADO = new URL('../../src/lib/_route-matcher.mut.ts', import.meta.url);

// ── o laço de ANTES, tal como estava no runtime ─────────────────────────────
function antes(routePool, method, restPath) {
  let matched = null;
  for (const route of routePool) {
    if (route.method !== method) continue;
    const matcher = match(route.path, { decode: decodeURIComponent });
    const result = matcher(restPath);
    if (!result) continue;
    const score = (route.path.match(/:/g) || []).length;
    const candidate = { route, params: result.params, score };
    if (!matched || candidate.score < matched.score) matched = candidate;
  }
  return matched;
}

const METODOS = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'];
const AMOSTRAS = ['abc', 'a%20b', 'a%2Fb', 'x-1', '123', 'inbound', 'agents', 'messages'];
function pedidos() {
  const ps = new Set(['/', '', '/whatsapp', '/whatsapp/', '/whatsapp/inbound', '/whatsapp/inbound/', '/nao/existe', '/whatsapp/a/b/c/d/e/f', '/whatsapp/agents', '/whatsapp/groups', '/whatsapp/abc/messages']);
  for (const r of PortalSuporteRoutes) {
    for (const a of AMOSTRAS) {
      ps.add(r.path.replace(/:[A-Za-z0-9_]+/g, a));
      ps.add(r.path.replace(/:[A-Za-z0-9_]+/g, a) + '/');
    }
  }
  return [...ps];
}

async function suite(mod, rotulo) {
  const falhas = [];
  const { matchStaticRoute, matcherCacheSize, matcherFor } = mod;
  const ps = pedidos();
  const antesDe = matcherCacheSize();
  let comparacoes = 0, casaram = 0, comConflito = 0, divergiu = null;
  for (const m of METODOS) {
    for (const p of ps) {
      comparacoes++;
      const ref = antes(PortalSuporteRoutes, m, p);
      const novo = matchStaticRoute(PortalSuporteRoutes, m, p);
      if (ref) casaram++;
      const candidatos = PortalSuporteRoutes.filter((r) => r.method === m && match(r.path, { decode: decodeURIComponent })(p)).length;
      if (candidatos > 1) comConflito++;
      const igual = (!ref && !novo) || (ref && novo && ref.route === novo.route && ref.score === novo.score && JSON.stringify(ref.params) === JSON.stringify(novo.params));
      if (!igual && !divergiu) divergiu = { m, p, ref: ref && [ref.route.path, ref.score, ref.params], novo: novo && [novo.route.path, novo.score, novo.params] };
    }
  }
  if (divergiu) falhas.push('equivalencia');
  if (!(casaram > 400)) falhas.push('trava-casaram');
  if (!(comConflito > 20)) falhas.push('trava-conflito');
  const distintos = new Set(PortalSuporteRoutes.map((r) => r.path)).size;
  const tam1 = matcherCacheSize() - antesDe;
  if (tam1 !== distintos) falhas.push('cache-um-por-caminho');
  for (const p of ps.slice(0, 200)) matchStaticRoute(PortalSuporteRoutes, 'GET', p);
  if (matcherCacheSize() - antesDe !== tam1) falhas.push('cache-estavel');
  // o casador é REAPROVEITADO: a mesma função volta para o mesmo caminho
  if (!PortalSuporteRoutes.every((r) => matcherFor(r.path) === matcherFor(r.path))) falhas.push('reaproveita')
  // params decodificados
  const dec = matchStaticRoute([{ method: 'GET', path: '/x/:id', handler: null }], 'GET', '/x/a%20b');
  if (!dec || dec.params.id !== 'a b') falhas.push('decode');
  // malformado lança igual
  let e1 = null, e2 = null;
  try { antes(PortalSuporteRoutes, 'GET', '/whatsapp/%E0%A4%A'); } catch (e) { e1 = e.name; }
  try { matchStaticRoute(PortalSuporteRoutes, 'GET', '/whatsapp/%E0%A4%A'); } catch (e) { e2 = e.name; }
  if (!e1 || e1 !== e2) falhas.push('malformado');
  // caminho de rota inválido: lança nas duas e não entra no mapa
  const invalida = [{ method: 'GET', path: '/a/:', handler: null }];
  let i1 = false, i2 = false;
  try { antes(invalida, 'GET', '/a/b'); } catch { i1 = true; }
  const t0 = matcherCacheSize();
  try { matchStaticRoute(invalida, 'GET', '/a/b'); } catch { i2 = true; }
  if (!(i1 && i2) || matcherCacheSize() !== t0) falhas.push('invalida');
  return { falhas, comparacoes, casaram, comConflito, distintos, divergiu };
}

let falhasTotal = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhasTotal++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

const base = await import(ORIGINAL.href);
const r = await suite(base, 'novo');
ok(`equivalência com o laço de antes (${r.comparacoes} pedidos, ${r.casaram} casaram, ${r.comConflito} com mais de uma candidata)`, !r.falhas.includes('equivalencia'), r.divergiu);
ok('TRAVA: o teste exerce casamentos (mais de 400) e conflitos de pontuação (mais de 20)', !r.falhas.includes('trava-casaram') && !r.falhas.includes('trava-conflito'), r);
ok(`o mapa tem um casador por caminho distinto (${r.distintos}) e não cresce na segunda passada`, !r.falhas.includes('cache-um-por-caminho') && !r.falhas.includes('cache-estavel'), r.falhas);
ok('o casador de um caminho é a MESMA função a cada pedido (o mapa é de fato usado)', !r.falhas.includes('reaproveita'), r.falhas);
ok('parâmetros saem decodificados (a%20b -> "a b")', !r.falhas.includes('decode'), r.falhas);
ok('caminho de pedido malformado lança igual nos dois', !r.falhas.includes('malformado'), r.falhas);
ok('caminho de rota inválido lança e não entra no mapa', !r.falhas.includes('invalida'), r.falhas);

// ── medição local (INFO, sem asserção): GET numa rota com parâmetro, pool real ──
{
  const N = 2000, P = '/whatsapp/abc/messages';
  let t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) antes(PortalSuporteRoutes, 'GET', P);
  const msAntes = Number(process.hrtime.bigint() - t) / 1e6;
  base.matchStaticRoute(PortalSuporteRoutes, 'GET', P);
  t = process.hrtime.bigint();
  for (let i = 0; i < N; i++) base.matchStaticRoute(PortalSuporteRoutes, 'GET', P);
  const msNovo = Number(process.hrtime.bigint() - t) / 1e6;
  console.log(`INFO  ${PortalSuporteRoutes.length} rotas, ${N} casamentos de GET ${P}: antes ${(msAntes / N * 1000).toFixed(1)} µs/pedido | agora ${(msNovo / N * 1000).toFixed(1)} µs/pedido (medição local, máquina de desenvolvimento)`);
}

// ── mutações: cada uma se aplica uma vez e é pega por asserção ──
const fonte = fs.readFileSync(ORIGINAL, 'utf8');
const MUTS = [
  ['sem guardar o casador', '    matchers.set(path, m)\n', ''],
  ['decode que não decodifica', '{ decode: decodeURIComponent }', '{ decode: (s: string) => s }'],
  ['empate fica com a última (<=)', 'candidate.score < matched.score', 'candidate.score <= matched.score'],
  ['vence a de MAIS parâmetros', 'candidate.score < matched.score', 'candidate.score > matched.score'],
  ['ignora o método', "    if (route.method !== method) continue\n", ''],
  ['o mapa é gravado mas nunca lido', 'let m = matchers.get(path)', "let m = matchers.get('_nunca')"],
];
for (const [nome, de, para] of MUTS) {
  const n = fonte.split(de).length - 1;
  if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue; }
  fs.writeFileSync(MUTADO, fonte.replace(de, () => para));
  try {
    const mod = await import(MUTADO.href + '?m=' + encodeURIComponent(nome));
    const f = (await suite(mod, nome)).falhas;
    ok(`mutação "${nome}" é pega (${f.join(',')})`, f.length > 0, 'sobreviveu');
  } catch (e) {
    ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e));
  } finally {
    fs.rmSync(MUTADO, { force: true });
  }
}
if (falhasTotal) { console.log(`\n${falhasTotal} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
