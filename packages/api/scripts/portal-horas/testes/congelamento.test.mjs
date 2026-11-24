// Fechamento congela o resultado do Financeiro (fatia 2). Handlers carregados
// do routes.generated.ts; models falsos fiéis à camada (_fakes.mjs). Massa SINTÉTICA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { carregarHandler, todosHandlers } from './_carregar.mjs';
import { tabela, contexto } from './_fakes.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FONTE_FIN = fs.readFileSync(path.resolve(__dirname, '../finance-controller.js'), 'utf8');

const financeiro = carregarHandler('GET', '/finance/investment-calculator');
const agir = carregarHandler('POST', '/month-closures/:month/:acao');
const listar = carregarHandler('GET', '/month-closures');
const ver = carregarHandler('GET', '/month-closures/:month');

function mesAtual() {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  return p.find((x) => x.type === 'year').value + '-' + p.find((x) => x.type === 'month').value;
}
function somaMes(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
}
const MES = somaMes(mesAtual(), -1);

function mundo() {
  const perfis = [
    { id: 'adm', role: 'admin', email: 'adm@x', full_name: 'Admin Teste' },
    { id: 'a', role: 'user', email: 'a@x', full_name: 'Ana Teste', contract_type: 'CLT', rate_type: 'monthly', monthly_rate: 6000 },
    { id: 'b', role: 'user', email: 'b@x', full_name: 'Bruno Teste', contract_type: 'PJ', rate_type: 'hourly', hourly_rate: 40 },
  ];
  const L = (id, u, dia, tipo, ini, fim) => ({
    id,
    user_id: u,
    date: `${MES}-${dia}`,
    start_time: ini,
    end_time: fim,
    duration_minutes: (Number(fim.slice(0, 2)) - Number(ini.slice(0, 2))) * 60,
    hour_type: tipo,
    status: 'APPROVED',
  });
  return {
    StaffProfile: tabela(perfis),
    HourEntries: tabela([
      L('e1', 'a', '05', 'EXTRA', '18:00', '21:00'),
      L('e2', 'a', '06', 'BIP_STANDBY', '08:00', '20:00'),
      L('e3', 'b', '05', 'EXTRA', '18:00', '20:00'),
      L('e4', 'b', '07', 'NORMAL', '09:00', '17:00'),
    ]),
    Holidays: tabela([]),
    MonthClosures: tabela([]),
  };
}
const fin = (w, user = 'adm') => financeiro(contexto({ query: { month: MES }, user, models: w }));
const fechar = (w) => agir(contexto({ method: 'POST', params: { month: MES, acao: 'close' }, body: { reason: 'folha' }, models: w }));
const reabrir = (w) => agir(contexto({ method: 'POST', params: { month: MES, acao: 'reopen' }, body: { reason: 'ajuste' }, models: w }));
const semMeta = (b) => {
  const c = { ...b };
  delete c.congelado;
  return c;
};

/** Muda o que o Financeiro usa: salário, valor hora, feriado e um lançamento novo. */
function mexerNoMundo(w) {
  w.StaffProfile.rows.find((p) => p.id === 'a').monthly_rate = 9000;
  w.StaffProfile.rows.find((p) => p.id === 'b').hourly_rate = 80;
  w.Holidays.rows.push({ id: 'h', date: `${MES}-06`, _criado: 99 });
  w.HourEntries.rows.push({ id: 'e9', user_id: 'b', date: `${MES}-09`, start_time: '18:00', end_time: '22:00', duration_minutes: 240, hour_type: 'EXTRA', status: 'APPROVED', _criado: 99 });
}

test('o congelado é exatamente o Financeiro do momento do fechamento', async () => {
  const w = mundo();
  const antes = await fin(w);
  assert.equal(antes.status, 200);
  assert.equal(antes.body.congelado, null);
  assert.equal((await fechar(w)).status, 200);
  const reg = w.MonthClosures.rows.find((r) => r.id === MES);
  assert.deepEqual(reg.snapshot, semMeta(antes.body));
});

test('mês fechado: mudar salário, valor hora, feriado ou lançamento não muda o Financeiro', async () => {
  const w = mundo();
  const antes = await fin(w);
  await fechar(w);
  mexerNoMundo(w);
  const depois = await fin(w);
  assert.equal(depois.status, 200);
  assert.deepEqual(semMeta(depois.body), semMeta(antes.body));
  assert.ok(depois.body.congelado, 'resposta marca que é o congelado');
  assert.equal(depois.body.congelado.closedByName, 'Admin Teste');
  assert.ok(depois.body.congelado.closedAt);
});

test('pessoa comum vê só a própria linha do congelado, com totais da própria linha', async () => {
  const w = mundo();
  const vivo = await fin(w, 'b'); // como o Financeiro responde hoje para ela
  await fechar(w);
  mexerNoMundo(w);
  const r = await fin(w, 'b');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.rows.map((x) => x.userId), ['b']);
  assert.deepEqual(r.body.rows, vivo.body.rows);
  assert.deepEqual(r.body.totals, vivo.body.totals);
  assert.ok(!JSON.stringify(r.body).includes('Ana Teste'), 'não pode vazar linha de outra pessoa');
});

test('reabrir volta a calcular ao vivo; o congelado anterior fica guardado, sem aparecer na leitura', async () => {
  const w = mundo();
  const antes = await fin(w);
  await fechar(w);
  mexerNoMundo(w);
  assert.equal((await reabrir(w)).status, 200);
  const reg = w.MonthClosures.rows.find((r) => r.id === MES);
  assert.equal(reg.snapshot, null);
  const reab = reg.history.find((h) => h.action === 'REABRIR');
  assert.deepEqual(reab.snapshotAnterior, semMeta(antes.body));

  const vivo = await fin(w);
  assert.equal(vivo.body.congelado, null);
  assert.notDeepEqual(semMeta(vivo.body), semMeta(antes.body)); // salário e lançamento novos entram

  // fechar de novo congela o novo cálculo
  assert.equal((await fechar(w)).status, 200);
  const novo = w.MonthClosures.rows.find((r) => r.id === MES).snapshot;
  assert.deepEqual(novo, semMeta(vivo.body));
});

test('a leitura do fechamento não devolve valores para ninguém', async () => {
  const w = mundo();
  await fechar(w);
  await reabrir(w);
  await fechar(w);
  for (const user of ['u', 'adm']) {
    const l = JSON.stringify((await listar(contexto({ user, models: w }))).body);
    const um = JSON.stringify((await ver(contexto({ user, params: { month: MES }, models: w }))).body);
    for (const txt of [l, um]) {
      assert.ok(!/snapshot|rows|monthlyRate|totalCost|6000/.test(txt), 'leitura do fechamento expôs valores: ' + txt.slice(0, 200));
    }
  }
});

test('cálculo do Financeiro falhou no fechamento: 503 e nada gravado', async () => {
  const w = mundo();
  w.Holidays = tabela([], { falharLeitura: true });
  const r = await fechar(w);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'calculo_indisponivel');
  assert.deepEqual(w.MonthClosures.gravacoes, []);
});

test('falha ao ler o fechamento no Financeiro: 503', async () => {
  const w = mundo();
  w.MonthClosures = tabela([], { falharLeitura: true });
  const r = await fin(w);
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'leitura_fechamento');
});

test('sem o model MonthClosures o Financeiro calcula ao vivo', async () => {
  const w = mundo();
  const base = { StaffProfile: w.StaffProfile, HourEntries: w.HourEntries, Holidays: w.Holidays };
  const r = await financeiro(contexto({ query: { month: MES }, models: base, ausentes: ['MonthClosures'] }));
  assert.equal(r.status, 200);
  assert.equal(r.body.congelado, null);
  assert.ok(r.body.rows.length === 2);
});

test('mês reaberto (registro aberto, sem congelado) calcula ao vivo', async () => {
  const w = mundo();
  w.MonthClosures = tabela([{ id: MES, month: MES, status: 'aberto', snapshot: null, history: [] }]);
  const r = await fin(w);
  assert.equal(r.body.congelado, null);
  // registro aberto que ainda carregue um congelado não é servido
  const velho = { month: MES, rows: [], totals: {}, workingDaysInMonth: 1 };
  w.MonthClosures = tabela([{ id: MES, month: MES, status: 'aberto', snapshot: velho, history: [] }]);
  const r2 = await fin(w);
  assert.equal(r2.body.congelado, null);
  assert.equal(r2.body.rows.length, 2);
});

test('o fechamento usa cópia exata do finance-controller.js', () => {
  const fin = todosHandlers().find((h) => h.method === 'GET' && h.path === '/finance/investment-calculator');
  assert.equal(fin.code, FONTE_FIN);
  const mc = todosHandlers().filter((h) => h.path.startsWith('/month-closures'));
  assert.equal(mc.length, 3);
  for (const h of mc) {
    const a = h.code.indexOf('var financeiro = (function () {');
    const b = h.code.indexOf('// </financeiro>');
    assert.ok(a > 0 && b > a, `${h.method} ${h.path} sem o bloco do financeiro`);
    assert.ok(h.code.slice(a, b).includes(FONTE_FIN), `${h.method} ${h.path} tem cópia diferente`);
  }
});
