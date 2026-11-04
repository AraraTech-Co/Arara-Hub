// Valor hora × valor mensal no cadastro (apps/portal-horas/src/lib/valor-hora.js),
// e coerência com o servidor: a tela e o Financeiro usam o mesmo divisor.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  divisorDoContrato,
  editarValor,
  fixoDaHora,
  horaDoFixo,
  trocarContrato,
} from '../../../../../apps/portal-horas/src/lib/valor-hora.js';
import { carregarHandler } from './_carregar.mjs';

const vazio = { contractType: 'PJ', hourlyRate: '', monthlyRate: '', rateSource: null };

test('divisor: PJ (ou sem tipo) = 168, CLT = 200', () => {
  assert.equal(divisorDoContrato('PJ'), 168);
  assert.equal(divisorDoContrato(''), 168);
  assert.equal(divisorDoContrato(undefined), 168);
  assert.equal(divisorDoContrato(' clt '), 200);
});

test('mensal → hora e hora → mensal, em centavos', () => {
  assert.equal(horaDoFixo('5000', 'CLT'), '25.00');
  assert.equal(horaDoFixo('5750.95', 'PJ'), '34.23');
  assert.equal(fixoDaHora('25', 'CLT'), '5000.00');
  assert.equal(fixoDaHora('20', 'PJ'), '3360.00');
  assert.equal(horaDoFixo('', 'CLT'), '');
  assert.equal(horaDoFixo('abc', 'CLT'), '');
  assert.equal(horaDoFixo('-10', 'CLT'), '');
});

test('digitar o mensal calcula a hora; digitar a hora calcula o mensal', () => {
  let f = editarValor({ ...vazio, contractType: 'CLT' }, 'monthlyRate', '5000');
  assert.equal(f.hourlyRate, '25.00');
  assert.equal(f.rateSource, 'monthly');
  f = editarValor(f, 'hourlyRate', '30');
  assert.equal(f.monthlyRate, '6000.00');
  assert.equal(f.rateSource, 'hourly');
  // Apagar um apaga o outro (nunca ficam incoerentes).
  f = editarValor(f, 'monthlyRate', '');
  assert.equal(f.hourlyRate, '');
});

test('trocar o contrato recalcula o campo que não é a base', () => {
  // Base = mensal digitado: a hora muda, o mensal fica.
  let f = editarValor(vazio, 'monthlyRate', '5000'); // PJ: 29.76
  assert.equal(f.hourlyRate, '29.76');
  f = trocarContrato(f, 'CLT');
  assert.equal(f.contractType, 'CLT');
  assert.equal(f.monthlyRate, '5000');
  assert.equal(f.hourlyRate, '25.00');
  // Base = hora digitada: o mensal muda, a hora fica.
  let g = editarValor({ ...vazio, contractType: 'CLT' }, 'hourlyRate', '25');
  g = trocarContrato(g, 'PJ');
  assert.equal(g.hourlyRate, '25');
  assert.equal(g.monthlyRate, '4200.00');
});

test('edição aberta sem digitar: base é o mensal gravado', () => {
  const aberto = { contractType: 'PJ', hourlyRate: '34.23', monthlyRate: '5750.95', rateSource: null };
  const f = trocarContrato(aberto, 'CLT');
  assert.equal(f.monthlyRate, '5750.95');
  assert.equal(f.hourlyRate, '28.75');
  // Sem mensal, a base é a hora.
  const h = trocarContrato({ ...aberto, monthlyRate: '' }, 'CLT');
  assert.equal(h.hourlyRate, '34.23');
  assert.equal(h.monthlyRate, '6846.00');
});

test('coerência tela × servidor: mesmo valor hora para PJ e CLT', async () => {
  const finance = carregarHandler('GET', '/finance/investment-calculator');
  const perfis = [
    { id: 'adm', role: 'admin', email: 'a@x' },
    { id: 'p', role: 'user', email: 'p@x', monthly_rate: 5750.95, contract_type: 'PJ' },
    { id: 'c', role: 'user', email: 'c@x', monthly_rate: 5750.95, contract_type: 'CLT' },
  ];
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
  const res = await finance({
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
  assert.equal(res.status, 200);
  for (const [id, tipo] of [
    ['p', 'PJ'],
    ['c', 'CLT'],
  ]) {
    const linha = res.body.rows.find((r) => r.userId === id);
    assert.equal(linha.referenceHourlyRate.toFixed(2), horaDoFixo('5750.95', tipo), tipo);
  }
});
