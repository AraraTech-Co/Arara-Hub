// Financeiro lê todas as páginas: a camada devolve no máximo 500 registros por
// chamada, os mais recentes primeiro (packages/api/src/lib/models.ts). O fake
// abaixo reproduz isso: igualdade por campo, ordem por criação decrescente,
// teto de 500 e offset. Massa SINTÉTICA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');

/** Fake fiel à camada: filtra, ordena do mais novo ao mais velho, corta em 500. */
function camada(linhas, { aoLer } = {}) {
  let chamadas = 0;
  const fn = async (filtro = {}) => {
    chamadas += 1;
    if (aoLer) aoLer(chamadas, linhas);
    const meta = new Set(['limit', 'offset']);
    const campos = Object.entries(filtro).filter(([k]) => !meta.has(k));
    const take = Math.min(500, Math.max(1, Number(filtro.limit) || 500));
    const skip = Math.max(0, Number(filtro.offset) || 0);
    return linhas
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice()
      .sort((a, b) => b._criado - a._criado)
      .slice(skip, skip + take);
  };
  fn.chamadas = () => chamadas;
  return fn;
}

let seq = 0;
function lanc(date, tipo = 'NORMAL', min = 60) {
  seq += 1;
  return {
    id: 'e' + seq,
    _criado: seq,
    user_id: 'c',
    date,
    start_time: '09:00',
    end_time: '10:00',
    hour_type: tipo,
    duration_minutes: min,
    status: 'APPROVED',
  };
}
const diaDe = (mes, i) => `${mes}-${String((i % 28) + 1).padStart(2, '0')}`;

const PERFIS = [
  { id: 'adm', role: 'admin', email: 'adm@x' },
  { id: 'c', role: 'user', email: 'c@x', contract_type: 'PJ', rate_type: 'hourly', hourly_rate: 40 },
];

async function rodar({ entries, holidays = [], perfis = PERFIS, mes = '2026-09' }) {
  let s = 200;
  const res = await finance({
    query: { month: mes },
    user: { id: 'adm', roles: ['admin'] },
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: perfis.findMany || camada(perfis),
      },
      HourEntries: { findMany: entries },
      Holidays: { findMany: holidays.findMany || camada(holidays) },
    },
    reply: {
      status(c) {
        s = c;
        return this;
      },
      send(b) {
        return { status: s, body: b };
      },
    },
  });
  return { status: s, body: res.body };
}
const linhaC = (r) => r.body.rows.find((x) => x.userId === 'c');

test('mês com lançamentos além dos 500 mais recentes entra inteiro', async () => {
  seq = 0;
  // setembro criado primeiro (mais antigo): 100 normais + 10 extras
  const set = [];
  for (let i = 0; i < 100; i += 1) set.push(lanc(diaDe('2026-09', i)));
  for (let i = 0; i < 10; i += 1) set.push(lanc(diaDe('2026-09', i), 'EXTRA', 30));
  // depois, 1.100 lançamentos de novembro (mais novos)
  const nov = [];
  for (let i = 0; i < 1100; i += 1) nov.push(lanc(diaDe('2026-11', i)));
  const todos = [...set, ...nov];

  const r = await rodar({ entries: camada(todos) });
  assert.equal(r.status, 200);
  const so = await rodar({ entries: camada(set) });
  assert.equal(linhaC(r).normalHours, 100);
  assert.equal(linhaC(r).extraAndAttendanceHours, 5);
  // igual, campo a campo, ao cálculo com só os lançamentos de setembro
  assert.deepEqual(linhaC(r), linhaC(so));
  assert.deepEqual(r.body.totals, so.body.totals);
});

test('lê página a página e para na página incompleta', async () => {
  seq = 0;
  const todos = [];
  for (let i = 0; i < 1200; i += 1) todos.push(lanc(diaDe('2026-09', i)));
  const f = camada(todos);
  const r = await rodar({ entries: f });
  assert.equal(linhaC(r).normalHours, 1200);
  assert.equal(f.chamadas(), 3); // 500 + 500 + 200
  const exato = camada(todos.slice(0, 1000));
  await rodar({ entries: exato });
  assert.equal(exato.chamadas(), 3); // 500 + 500 + 0
});

test('lançamento criado durante a leitura não conta duas vezes', async () => {
  seq = 0;
  const todos = [];
  for (let i = 0; i < 700; i += 1) todos.push(lanc(diaDe('2026-09', i)));
  // depois da 1ª página, entra um lançamento novo de novembro: tudo desce uma
  // posição e o último da página 1 reaparece no começo da página 2
  const f = camada(todos, {
    aoLer: (n, linhas) => {
      if (n === 2) linhas.push(lanc('2026-11-03'));
    },
  });
  const r = await rodar({ entries: f });
  assert.equal(linhaC(r).normalHours, 700);
});

test('leitura sem fim responde 503 em vez de calcular com dado faltando', async () => {
  let n = 0;
  const infinita = async () => Array.from({ length: 500 }, () => lanc('2026-09-0' + ((n++ % 9) + 1)));
  const r = await rodar({ entries: infinita });
  assert.equal(r.status, 503);
  assert.equal(r.body.error, 'leitura_incompleta');
});

test('feriado além dos 500 mais recentes conta nos dias úteis', async () => {
  seq = 0;
  // 7/9/2026 (segunda) é o feriado mais antigo; 600 datas mais novas depois
  const feriados = [{ id: 'h0', _criado: 0, date: '2026-09-07' }];
  for (let i = 1; i <= 600; i += 1) feriados.push({ id: 'h' + i, _criado: i, date: `2030-01-${String((i % 28) + 1).padStart(2, '0')}` });
  const com = await rodar({ entries: camada([]), holidays: feriados });
  const so = await rodar({ entries: camada([]), holidays: [feriados[0]] });
  assert.equal(com.body.workingDaysInMonth, so.body.workingDaysInMonth);
  assert.equal(com.body.workingDaysInMonth, 21); // setembro/2026: 22 dias úteis − 1 feriado
});

test('perfil além dos 500 mais recentes aparece no Financeiro', async () => {
  seq = 0;
  const perfis = [
    { id: 'adm', _criado: 9999, role: 'admin', email: 'adm@x' },
    { id: 'c', _criado: 0, role: 'user', email: 'c@x', contract_type: 'PJ', rate_type: 'hourly', hourly_rate: 40 },
  ];
  for (let i = 1; i <= 600; i += 1) perfis.push({ id: 'p' + i, _criado: i, role: 'user', email: `p${i}@x`, rate_type: 'hourly', hourly_rate: 10 });
  perfis.findMany = camada(perfis);
  const r = await rodar({ entries: camada([lanc('2026-09-01')]), perfis });
  assert.equal(r.status, 200);
  assert.ok(linhaC(r), 'perfil mais antigo tem de aparecer');
  assert.equal(linhaC(r).normalHours, 1);
});

test('leitura sem fim de feriados ou de perfis também responde 503', async () => {
  let n = 0;
  const infinita = async () => Array.from({ length: 500 }, () => ({ id: 'i' + n++, date: '2030-01-01', role: 'user' }));
  const f = await rodar({ entries: camada([]), holidays: { findMany: infinita } });
  assert.equal(f.status, 503);
  assert.equal(f.body.error, 'leitura_incompleta');
  const perfis = [...PERFIS];
  perfis.findMany = infinita;
  const p = await rodar({ entries: camada([]), perfis });
  assert.equal(p.status, 503);
});
