// Testes da célula do CSV: texto que a planilha leria como fórmula sai com
// apóstrofo na frente; número continua número. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell, buildCsv } from './csv-export.js';

test('texto que começa com = + - @ ganha apóstrofo', () => {
  assert.equal(csvCell('=1+1'), "'=1+1");
  assert.equal(csvCell('+A1*2'), "'+A1*2");
  assert.equal(csvCell('-chamado urgente'), "'-chamado urgente");
  assert.equal(csvCell('@SOMA(A1:A2)'), "'@SOMA(A1:A2)");
});

test('tabulação e retorno no início também ganham apóstrofo', () => {
  assert.equal(csvCell('\t=1+1'), "'\t=1+1");
  // retorno no início: apóstrofo e, por ter quebra de linha, aspas
  assert.equal(csvCell('\r=1+1'), '"\'\r=1+1"');
});

test('fórmula com separador: apóstrofo dentro das aspas', () => {
  assert.equal(csvCell('=HYPERLINK("x";"y")'), '"\'=HYPERLINK(""x"";""y"")"');
});

test('número puro, inclusive negativo, não muda', () => {
  assert.equal(csvCell('-1,50'), '-1,50');
  assert.equal(csvCell('+2'), '+2');
  assert.equal(csvCell(-3.25), '-3.25');
  assert.equal(csvCell('12,00'), '12,00');
  assert.equal(csvCell(0), '0');
});

test('texto comum e vazio não mudam', () => {
  assert.equal(csvCell('Ajuste no chamado 123'), 'Ajuste no chamado 123');
  assert.equal(csvCell('a=b'), 'a=b');
  assert.equal(csvCell(''), '');
  assert.equal(csvCell(null), '');
  assert.equal(csvCell(undefined), '');
  assert.equal(csvCell('tem;separador'), '"tem;separador"');
});

test('buildCsv aplica a proteção em cabeçalho e linhas', () => {
  const csv = buildCsv([{ d: '=cmd', h: '-1,50' }], [
    { header: 'Descrição', value: (r) => r.d },
    { header: 'Horas', value: (r) => r.h },
  ]);
  assert.equal(csv, "﻿Descrição;Horas\r\n'=cmd;-1,50\r\n");
});
