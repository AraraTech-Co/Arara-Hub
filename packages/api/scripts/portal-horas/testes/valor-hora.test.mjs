// Valor hora × valor mensal no cadastro (apps/portal-horas/src/lib/valor-hora.js),
// e coerência com o servidor: a tela e o Financeiro usam o mesmo divisor.
// Massa sintética (nenhum salário real).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  divisorDoContrato,
  editarValor,
  fixoDaHora,
  horaDoFixo,
  origemPendente,
  trocarContrato,
} from '../../../../../apps/portal-horas/src/lib/valor-hora.js';
import { carregarHandler } from './_carregar.mjs';

const vazio = { contractType: 'PJ', hourlyRate: '', monthlyRate: '', rateType: '' };

test('divisor: PJ (ou sem tipo) = 168, CLT = 200', () => {
  assert.equal(divisorDoContrato('PJ'), 168);
  assert.equal(divisorDoContrato(''), 168);
  assert.equal(divisorDoContrato(undefined), 168);
  assert.equal(divisorDoContrato(' clt '), 200);
});

test('mensal → hora e hora → mensal, em centavos (só exibição)', () => {
  assert.equal(horaDoFixo('5000', 'CLT'), '25.00');
  assert.equal(horaDoFixo('6543.21', 'PJ'), '38.95');
  assert.equal(horaDoFixo('6543.21', 'CLT'), '32.72');
  assert.equal(fixoDaHora('25', 'CLT'), '5000.00');
  assert.equal(fixoDaHora('20', 'PJ'), '3360.00');
  assert.equal(horaDoFixo('', 'CLT'), '');
  assert.equal(horaDoFixo('abc', 'CLT'), '');
  assert.equal(horaDoFixo('-10', 'CLT'), '');
});

test('digitar o mensal marca origem Mensal; digitar a hora marca origem Hora', () => {
  let f = editarValor({ ...vazio, contractType: 'CLT' }, 'monthlyRate', '5000');
  assert.equal(f.hourlyRate, '25.00');
  assert.equal(f.rateType, 'monthly');
  f = editarValor(f, 'hourlyRate', '30');
  assert.equal(f.monthlyRate, '6000.00');
  assert.equal(f.rateType, 'hourly');
  // Apagar um apaga o outro (nunca ficam incoerentes).
  f = editarValor(f, 'monthlyRate', '');
  assert.equal(f.hourlyRate, '');
});

test('trocar o contrato recalcula a partir da origem gravada', () => {
  // Origem mensal: a hora muda, o mensal fica.
  let f = editarValor(vazio, 'monthlyRate', '5000'); // PJ: 29.76
  assert.equal(f.hourlyRate, '29.76');
  f = trocarContrato(f, 'CLT');
  assert.equal(f.contractType, 'CLT');
  assert.equal(f.monthlyRate, '5000');
  assert.equal(f.hourlyRate, '25.00');
  // Origem hora: o mensal muda, a hora fica.
  let g = editarValor({ ...vazio, contractType: 'CLT' }, 'hourlyRate', '25');
  g = trocarContrato(g, 'PJ');
  assert.equal(g.hourlyRate, '25');
  assert.equal(g.monthlyRate, '4200.00');
});

test('cadastro reaberto preserva a origem gravada', () => {
  const reaberto = { contractType: 'PJ', hourlyRate: '38.95', monthlyRate: '6543.21', rateType: 'monthly' };
  const f = trocarContrato(reaberto, 'CLT');
  assert.equal(f.monthlyRate, '6543.21');
  assert.equal(f.hourlyRate, '32.72');
  assert.equal(f.rateType, 'monthly');
});

test('sem origem (legado): trocar contrato não recalcula nada e o cadastro fica pendente', () => {
  const legado = { contractType: 'PJ', hourlyRate: '38.95', monthlyRate: '6543.21', rateType: '' };
  assert.equal(origemPendente(legado), true);
  const f = trocarContrato(legado, 'CLT');
  assert.equal(f.contractType, 'CLT');
  assert.equal(f.hourlyRate, '38.95');
  assert.equal(f.monthlyRate, '6543.21');
  assert.equal(origemPendente({ ...legado, rateType: 'monthly' }), false);
  assert.equal(origemPendente({ ...legado, monthlyRate: '' }), false);
});

function financeComPerfis(perfis) {
  const finance = carregarHandler('GET', '/finance/investment-calculator');
  const vazioFind = async () => [];
  const reply = {
    s: 200,
    status(c) {
      this.s = c;
      return this;
    },
    send(b) {
      return { status: this.s, body: b };
    },
  };
  return finance({
    query: { month: '2026-11' },
    user: { id: 'adm', roles: ['admin'] },
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: async () => perfis,
      },
      HourEntries: { findMany: vazioFind },
      Holidays: { findMany: vazioFind },
    },
    reply,
  });
}

test('coerência tela × servidor: mesmo valor hora (exibido) para PJ e CLT', async () => {
  const res = await financeComPerfis([
    { id: 'adm', role: 'admin', email: 'a@x' },
    { id: 'p', role: 'user', email: 'p@x', monthly_rate: 6543.21, contract_type: 'PJ' },
    { id: 'c', role: 'user', email: 'c@x', monthly_rate: 6543.21, contract_type: 'CLT' },
  ]);
  assert.equal(res.status, 200);
  for (const [id, tipo] of [
    ['p', 'PJ'],
    ['c', 'CLT'],
  ]) {
    const linha = res.body.rows.find((r) => r.userId === id);
    assert.equal(linha.referenceHourlyRate.toFixed(2), horaDoFixo('6543.21', tipo), tipo);
  }
});

test('o que a tela grava na origem mensal não prende o servidor à hora arredondada', async () => {
  const form = editarValor({ ...vazio, contractType: 'CLT' }, 'monthlyRate', '6543.21');
  const res = await financeComPerfis([
    { id: 'adm', role: 'admin', email: 'a@x' },
    {
      id: 'c',
      role: 'user',
      email: 'c@x',
      contract_type: form.contractType,
      monthly_rate: Number(form.monthlyRate),
      hourly_rate: Number(form.hourlyRate), // 32.72, arredondado
      rate_type: form.rateType,
    },
  ]);
  const linha = res.body.rows.find((r) => r.userId === 'c');
  assert.equal(linha.rateOrigin, 'monthly');
  assert.equal(linha.rateOriginPending, false);
});
