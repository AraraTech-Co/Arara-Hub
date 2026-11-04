// Geração de CSV no próprio navegador para a tela de Exportações.
// O servidor nunca montou o arquivo nem expôs rota de download, então a tela
// busca os lançamentos e monta o CSV aqui. Separador ';' + BOM UTF-8 para o
// Excel pt-BR abrir com acentos e colunas corretas.

const CSV_SEP = ';';

/** Escapa uma célula: aspas quando houver separador, aspas ou quebra de linha. */
export function csvCell(value) {
  const s = value === null || value === undefined ? '' : String(value);
  if (/[";\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

/** Minutos → horas com vírgula decimal (ex.: 90 → "1,50"). Vazio se inválido. */
export function formatHours(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n)) return '';
  return (n / 60).toFixed(2).replace('.', ',');
}

/**
 * Filtra os lançamentos pelo período, colaboradores e tipos escolhidos.
 * Listas vazias = sem restrição naquela dimensão. Aceita camelCase e snake_case.
 */
export function filterHourEntries(entries, filter) {
  const list = Array.isArray(entries) ? entries : [];
  const { fromDate, toDate } = filter || {};
  const empIds = Array.isArray(filter?.employeeIds) ? filter.employeeIds : [];
  const types = Array.isArray(filter?.hourTypes) ? filter.hourTypes : [];
  const empSet = empIds.length ? new Set(empIds.map((x) => String(x))) : null;
  const typeSet = types.length ? new Set(types) : null;
  return list.filter((e) => {
    const d = String(e.date || '').slice(0, 10);
    if (fromDate && d < fromDate) return false;
    if (toDate && d > toDate) return false;
    if (empSet && !empSet.has(String(e.userId ?? e.user_id ?? ''))) return false;
    if (typeSet && !typeSet.has(e.hourType ?? e.hour_type)) return false;
    return true;
  });
}

/**
 * Monta o texto do CSV. `columns` é [{ header, value(row) }].
 * Prefixa BOM para o Excel reconhecer UTF-8.
 */
export function buildCsv(rows, columns) {
  const header = columns.map((c) => csvCell(c.header)).join(CSV_SEP);
  const body = (Array.isArray(rows) ? rows : [])
    .map((r) => columns.map((c) => csvCell(c.value(r))).join(CSV_SEP))
    .join('\r\n');
  return '﻿' + header + (body ? '\r\n' + body : '') + '\r\n';
}

// Grupos de tipo de hora do resumo de custos, na mesma divisão que o servidor
// usa nas colunas do Financeiro.
export const SUMMARY_GROUPS = Object.freeze(['normal', 'extraAtt', 'standbyBackup']);

const round2 = (n) => Number((Number(n) || 0).toFixed(2));

/**
 * Ajusta uma linha do resumo aos grupos escolhidos. Com os dois grupos
 * incrementais marcados a linha volta intacta (idêntica ao Financeiro); sem
 * algum deles, horas/custo incremental e custo total são refeitos só com o que
 * ficou marcado. Custo total = salário mensal + incremental, como no servidor.
 */
export function applySummaryGroups(row, groups) {
  const set = new Set(groups || []);
  const extra = set.has('extraAtt');
  const standby = set.has('standbyBackup');
  if (extra && standby) return row;
  const extraH = extra ? Number(row.extraAndAttendanceHours) || 0 : 0;
  const extraV = extra ? Number(row.extraAndAttendanceValue) || 0 : 0;
  const standbyH = standby ? Number(row.standbyAndBackupHours) || 0 : 0;
  const standbyV = standby ? Number(row.standbyAndBackupValue) || 0 : 0;
  const incrementalTotal = round2(extraV + standbyV);
  return {
    ...row,
    incrementalHours: round2(extraH + standbyH),
    incrementalTotal,
    totalCost: round2((Number(row.monthlyRate) || 0) + incrementalTotal),
  };
}

/** Soma os campos numéricos indicados em todas as linhas (para a linha Totais). */
export function sumFields(rows, fields) {
  const out = {};
  for (const f of fields) {
    out[f] = round2((rows || []).reduce((s, r) => s + (Number(r[f]) || 0), 0));
  }
  return out;
}

/** Dispara o download de um texto como arquivo .csv no navegador. */
export function downloadCsvText(fileName, text) {
  const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName || 'export.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
