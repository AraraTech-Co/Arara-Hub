// A troca de senha da plataforma (src/lib/change-password.ts) sobre um Postgres REAL.
//
// O QUE SE PROVA:
//   - formato da nova senha (8 a 72 bytes) e "igual à atual" são recusados sem tocar no banco;
//   - senha atual errada: recusa, o hash NÃO muda, conta uma tentativa;
//   - 5 erradas em 15 minutos: a sexta é recusada por limite, MESMO com a senha certa, e a
//     espera é informada; passada a janela, volta a valer; acerto zera o contador;
//   - sucesso: o hash muda (a nova confere, a antiga não), os tokens de renovação do usuário
//     são encerrados MENOS o que o chamador disse ser o dele, e os de outros usuários
//     não são tocados;
//   - o `ctx.users.changeOwnPassword` do runtime (buildHandlerCtx) chega à mesma operação.
//
// Sem banco, o arquivo se declara PENDENTE e sai: nunca passa por verde sem ter rodado.
// MUTAÇÕES no módulo (cada uma aplicada uma vez) reprovam por asserção.
//
// Roda com (tsx, porque o módulo importa `.js` de arquivos `.ts`):
//   DATABASE_URL=postgresql://... npx prisma db push --skip-generate
//   DATABASE_URL=postgresql://... npx tsx scripts/testes/troca-de-senha-real.test.mjs
import fs from 'node:fs';
import { PrismaClient } from '@prisma/client';

const p = process.env.DATABASE_URL ? new PrismaClient() : null;
let vivo = false;
if (p) { try { await p.$queryRaw`SELECT 1`; vivo = true; } catch { /* sem banco */ } }
if (!vivo) {
  console.log('PENDENTE  sem DATABASE_URL alcançável: a troca de senha NÃO foi exercitada sobre Postgres real.');
  process.exit(0);
}

const { hashPassword, verifyPassword, hashRefreshToken } = await import('../../src/lib/crypto.ts');
const ORIGINAL = new URL('../../src/lib/change-password.ts', import.meta.url);
const MUTADO = new URL('../../src/lib/_change-password.mut.ts', import.meta.url);

let falhasTotal = 0;
const ok = (nome, cond, det) => {
  if (!cond) falhasTotal++;
  console.log((cond ? 'ok   ' : 'FALHA') + ' ' + nome + (cond ? '' : ' -> ' + JSON.stringify(det).slice(0, 300)));
};

const SENHA = 'senha-atual-1';
const EMAILS = ['troca-a@teste.local', 'troca-b@teste.local'];

async function preparar() {
  await p.user.deleteMany({ where: { email: { in: EMAILS } } });
  const hash = await hashPassword(SENHA);
  const a = await p.user.create({ data: { email: EMAILS[0], passwordHash: hash } });
  const b = await p.user.create({ data: { email: EMAILS[1], passwordHash: hash } });
  const tok = (u, n) => ({ userId: u.id, tokenHash: hashRefreshToken(n), expiresAt: new Date(Date.now() + 86400e3) });
  await p.refreshToken.createMany({ data: [tok(a, 'a-atual'), tok(a, 'a-outro1'), tok(a, 'a-outro2'), tok(b, 'b-1')] });
  return { a, b };
}
const tokensAbertos = async (u) => (await p.refreshToken.findMany({ where: { userId: u.id, revokedAt: null } })).map((t) => t.tokenHash).sort();
const hashDe = async (u) => (await p.user.findUnique({ where: { id: u.id } })).passwordHash;

async function suite(mod) {
  const falhas = [];
  const { changeOwnPassword, limparErrosDeTroca } = mod;
  limparErrosDeTroca();
  const { a, b } = await preparar();
  let t = 1_000_000;
  const relogio = () => t;
  const troca = (over = {}) => changeOwnPassword(p, { userId: a.id, current: SENHA, next: 'nova-senha-1', manterRefreshToken: 'a-atual', ...over }, relogio);

  // formato e "igual": recusados sem tocar no banco
  const h0 = await hashDe(a);
  for (const [nome, over, cod] of [
    ['curta', { next: 'curta' }, 'invalida'],
    ['longa demais (73 bytes)', { next: 'x'.repeat(73) }, 'invalida'],
    ['igual à atual', { next: SENHA }, 'igual'],
  ]) {
    const r = await troca(over);
    if (r.ok || r.codigo !== cod) falhas.push('formato-' + nome);
  }
  const ok72 = await changeOwnPassword(p, { userId: b.id, current: SENHA, next: 'y'.repeat(72) }, relogio);
  if (!ok72.ok) falhas.push('72-bytes-aceita');
  // trocar a senha de B encerrou os tokens de B (é o esperado); reabre para o teste de "não toca no outro" mais abaixo
  await p.user.update({ where: { id: b.id }, data: { passwordHash: await hashPassword(SENHA) } });
  await p.refreshToken.updateMany({ where: { userId: b.id }, data: { revokedAt: null } });
  if ((await hashDe(a)) !== h0) falhas.push('formato-tocou-o-banco');

  // senha atual errada: recusa, hash intacto, e a janela de erros
  const r1 = await troca({ current: 'errada' });
  if (r1.ok || r1.codigo !== 'senha_atual' || (await hashDe(a)) !== h0) falhas.push('senha-errada');
  for (let i = 0; i < 4; i++) { t += 1000; await troca({ current: 'errada' }); }   // 5 erros no total
  const sexta = await troca();                                                      // senha CERTA, mas limite
  if (sexta.ok || sexta.codigo !== 'limite' || !(sexta.esperaSegundos > 0) || (await hashDe(a)) !== h0) falhas.push('limite');
  t += 15 * 60 * 1000 + 10_000;                                                      // janela esvaziou
  const depoisDaJanela = await troca({ current: 'errada' });
  if (depoisDaJanela.ok || depoisDaJanela.codigo !== 'senha_atual') falhas.push('janela-esvazia');

  // acerto: muda o hash, encerra os tokens menos o do chamador, não toca no outro usuário
  const certa = await troca();
  if (!certa.ok || certa.refreshTokensEncerrados !== 2) falhas.push('sucesso:' + JSON.stringify(certa));
  const h1 = await hashDe(a);
  if (h1 === h0 || !(await verifyPassword('nova-senha-1', h1)) || (await verifyPassword(SENHA, h1))) falhas.push('hash-trocado');
  const abertos = await tokensAbertos(a);
  if (abertos.length !== 1 || abertos[0] !== hashRefreshToken('a-atual')) falhas.push('mantem-so-o-do-chamador');
  if ((await tokensAbertos(b)).length !== 1) falhas.push('tocou-no-outro-usuario');

  // acerto zera o contador: 4 erros, 1 acerto, 4 erros de novo não bloqueiam
  limparErrosDeTroca();
  await p.user.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(SENHA) } });
  for (let i = 0; i < 4; i++) await troca({ current: 'errada' });
  const zera = await troca();
  if (!zera.ok) falhas.push('acerto-antes-do-limite');
  await p.user.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(SENHA) } });
  for (let i = 0; i < 4; i++) await troca({ current: 'errada' });
  const aindaOk = await troca();
  if (!aindaOk.ok) falhas.push('acerto-zera-contador');

  // sem token a manter: encerra todos do usuário
  await p.refreshToken.updateMany({ where: { userId: a.id }, data: { revokedAt: null } });
  await p.user.update({ where: { id: a.id }, data: { passwordHash: await hashPassword(SENHA) } });
  limparErrosDeTroca();
  const todos = await changeOwnPassword(p, { userId: a.id, current: SENHA, next: 'outra-senha-2' }, relogio);
  if (!todos.ok || (await tokensAbertos(a)).length !== 0) falhas.push('sem-token-a-manter');

  // usuário inexistente
  const nao = await changeOwnPassword(p, { userId: 'nao-existe', current: SENHA, next: 'nova-senha-1' }, relogio);
  if (nao.ok || nao.codigo !== 'nao_encontrado') falhas.push('inexistente');
  return falhas;
}

try {
  const base = await import(ORIGINAL.href);
  const f = await suite(base);
  ok('a bateria passa limpa sobre o Postgres real', f.length === 0, f);

  // o runtime chega à mesma operação
  const { buildHandlerCtx } = await import('../../src/lib/build-handler-ctx.ts');
  base.limparErrosDeTroca();
  const { a } = await preparar();
  const ctx = await buildHandlerCtx({ method: 'POST', params: {}, query: {}, body: null, rawBody: null, headers: {}, user: null, app: { id: 'x', slug: 'x', name: 'x' }, models: {}, prisma: p });
  const r = await ctx.users.changeOwnPassword({ userId: a.id, current: SENHA, next: 'nova-senha-1', keepRefreshToken: 'a-atual' });
  ok('ctx.users.changeOwnPassword (buildHandlerCtx) troca a senha e mantém o token do chamador', r.ok === true && (await tokensAbertos(a)).length === 1 && await verifyPassword('nova-senha-1', await hashDe(a)), r);

  const fonte = fs.readFileSync(ORIGINAL, 'utf8');
  const MUTS = [
    ['sem limite de tentativas', 'if (recentes.length >= LIMITE_ERROS) {', 'if (false) {'],
    ['limite de 5 para 500', 'export const LIMITE_ERROS = 5', 'export const LIMITE_ERROS = 500'],
    ['aceita qualquer senha atual', 'if (!(await verifyPassword(current, user.passwordHash))) {', 'if (false) {'],
    ['erro não é contado', "erros.set(userId, [...recentes, t])", 'void 0'],
    ['acerto não zera o contador', '  erros.delete(userId)\n\n  await prisma.user.update', '  await prisma.user.update'],
    ['janela que nunca esvazia', '(agora - t) < JANELA_MS', 'true'],
    ['encerra também o token do chamador', "...(manter ? { tokenHash: { not: manter } } : {}),", ''],
    ['não encerra nenhum token', 'data: { revokedAt: new Date(t) },', 'data: { revokedAt: null },'],
    ['encerra os tokens de todos os usuários', '      userId,\n      revokedAt: null,', '      revokedAt: null,'],
    ['aceita senha curta', 'next.length < SENHA_MIN ||', 'false ||'],
    ['aceita senha acima de 72 bytes', 'Buffer.byteLength(next, \'utf8\') > SENHA_MAX_BYTES', 'false'],
    ['aceita igual à atual', "if (next === current) return { ok: false, codigo: 'igual' }", ''],
  ];
  for (const [nome, de, para] of MUTS) {
    // a janela usa `agora - t`; ajusta o texto buscado ao código real
    const alvo = nome === 'janela que nunca esvazia' ? 'agora - t < JANELA_MS' : de;
    const subst = nome === 'janela que nunca esvazia' ? 'true' : para;
    const n = fonte.split(alvo).length - 1;
    if (n !== 1) { ok(`mutação "${nome}" aplica exatamente uma vez`, false, n); continue; }
    fs.writeFileSync(MUTADO, fonte.replace(alvo, () => subst));
    try {
      const mod = await import(MUTADO.href + '?m=' + encodeURIComponent(nome));
      const fm = await suite(mod);
      ok(`mutação "${nome}" é pega (${fm.join(',')})`, fm.length > 0, 'sobreviveu');
    } catch (e) {
      ok(`mutação "${nome}" reprova por asserção, não por erro de carga`, false, String(e).slice(0, 200));
    } finally {
      fs.rmSync(MUTADO, { force: true });
    }
  }
} finally {
  await p.user.deleteMany({ where: { email: { in: EMAILS } } });
  await p.$disconnect();
}
if (falhasTotal) { console.log(`\n${falhasTotal} FALHA(S)`); process.exit(1); }
console.log('\ntodos os casos passaram');
