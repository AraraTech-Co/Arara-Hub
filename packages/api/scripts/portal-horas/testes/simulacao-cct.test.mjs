// Simulação da regra do escritório (CCT SINDPD-SP 2026/2027) — NÃO validada.
// Handler carregado do routes.generated.ts. Massa SINTÉTICA; esperados feitos à
// mão: valor = minutos ÷ 60 × H × fator, arredondado uma vez por rubrica.
// Out/2026: dia 4 domingo, 6 terça, 9 sexta, 10 sábado, 12 segunda.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { carregarHandler } from './_carregar.mjs';

const finance = carregarHandler('GET', '/finance/investment-calculator');
const MES = '2026-10';

function fakeFindMany(rows) {
  return async (filtro = {}) => {
    const campos = Object.entries(filtro).filter(([k]) => k !== 'limit' && k !== 'offset');
    return rows
      .filter((r) => campos.every(([k, v]) => r[k] === v))
      .slice(0, Math.min(500, Number(filtro.limit) || 500));
  };
}
const min = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
// Lançamento com horário; duração = fim − início (atravessa a meia-noite se fim < início).
function lanc(tipo, date, ini, fim, extra = {}) {
  const d = min(fim) > min(ini) ? min(fim) - min(ini) : min(fim) + 1440 - min(ini);
  return {
    user_id: 'c',
    date,
    start_time: ini,
    end_time: fim,
    hour_type: tipo,
    duration_minutes: d,
    status: 'APPROVED',
    ...extra,
  };
}
async function sim(lancamentos, { hora = 22, perfil = {}, feriados = [] } = {}) {
  const perfis = [
    { id: 'adm', role: 'admin', email: 'adm@x' },
    {
      id: 'c',
      role: 'user',
      email: 'c@x',
      contract_type: 'CLT',
      rate_type: 'hourly',
      hourly_rate: hora,
      monthly_rate: hora * 200,
      ...perfil,
    },
  ];
  let s = 200;
  const res = await finance({
    query: { month: MES },
    user: { id: 'adm', roles: ['admin'] },
    models: {
      StaffProfile: {
        findById: async (id) => perfis.find((p) => p.id === id) || null,
        findMany: fakeFindMany(perfis),
      },
      HourEntries: { findMany: fakeFindMany(lancamentos) },
      Holidays: { findMany: fakeFindMany(feriados.map((date) => ({ date }))) },
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
  assert.equal(s, 200);
  return res.body.rows.find((r) => r.userId === 'c');
}

test('exemplo do escritório: domingo, escala 12h, atendimento 2h, H = 30 → 100 + 120 = 220', async () => {
  const r = await sim(
    [
      lanc('BIP_STANDBY', '2026-10-04', '08:00', '20:00'),
      lanc('BIP_ATTENDANCE', '2026-10-04', '10:00', '12:00'),
    ],
    { hora: 30 },
  );
  const s = r.simulacao;
  assert.equal(s.validada, false);
  assert.equal(s.regra, 'sim-cct-sindpd-sp-2026');
  assert.equal(s.sobreavisoBrutoMinutes, 720);
  assert.equal(s.sobreavisoAbatidoMinutes, 120);
  assert.equal(s.sobreavisoLiquidoMinutes, 600);
  assert.equal(s.sobreavisoValue, 100);
  assert.equal(s.trabalhoFimDeSemanaMinutes, 120);
  assert.equal(s.trabalhoFimDeSemanaValue, 120);
  assert.equal(s.incrementalTotal, 220);
  // O oficial não muda: 720 min × 30 × 0,3 + 120 min × 30 × 1 = 108 + 60.
  assert.equal(r.incrementalTotal, 168);
  assert.equal(s.diferenca, 52);
});

test('dia útil: 3h seguidas → 120 min a 1,75 (77,00) + 60 min a 2 (44,00)', async () => {
  const s = (await sim([lanc('EXTRA', '2026-10-06', '18:00', '21:00')])).simulacao;
  assert.equal(s.trabalhoFaixaMinutes, 120);
  assert.equal(s.trabalhoFaixaValue, 77);
  assert.equal(s.trabalhoExcedenteMinutes, 60);
  assert.equal(s.trabalhoExcedenteValue, 44);
  assert.equal(s.incrementalTotal, 121);
});

test('fronteira exata: 120 min fica todo na faixa; 121 min põe 1 min a 2×', async () => {
  const a = (await sim([lanc('EXTRA', '2026-10-06', '18:00', '20:00')])).simulacao;
  assert.equal(a.trabalhoFaixaMinutes, 120);
  assert.equal(a.trabalhoExcedenteMinutes, 0);
  const b = (await sim([lanc('EXTRA', '2026-10-06', '18:00', '20:01')])).simulacao;
  assert.equal(b.trabalhoFaixaMinutes, 120);
  assert.equal(b.trabalhoExcedenteMinutes, 1);
  assert.equal(b.trabalhoExcedenteValue, 0.73); // 1/60 × 22 × 2 = 0,7333
});

test('dois blocos separados no mesmo dia: cada um tem a sua faixa (contagem por bloco)', async () => {
  const s = (
    await sim([
      lanc('EXTRA', '2026-10-06', '18:00', '19:30'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '22:00', '23:30'),
    ])
  ).simulacao;
  assert.equal(s.parametros.faixa, 'consecutiva');
  assert.equal(s.trabalhoFaixaMinutes, 180);
  assert.equal(s.trabalhoExcedenteMinutes, 0);
  assert.equal(s.trabalhoFaixaValue, 115.5);
});

test('hora extra e atendimento colados formam um bloco só', async () => {
  const s = (
    await sim([
      lanc('EXTRA', '2026-10-06', '18:00', '19:00'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '19:00', '20:30'),
    ])
  ).simulacao;
  assert.equal(s.trabalhoFaixaMinutes, 120);
  assert.equal(s.trabalhoExcedenteMinutes, 30);
  assert.equal(s.trabalhoExcedenteValue, 22);
});

test('feriado em dia útil → 2× desde o primeiro minuto', async () => {
  const s = (
    await sim([lanc('EXTRA', '2026-10-12', '18:00', '19:00')], { feriados: ['2026-10-12'] })
  ).simulacao;
  assert.equal(s.trabalhoFimDeSemanaMinutes, 60);
  assert.equal(s.trabalhoFimDeSemanaValue, 44);
  // Contraste: sem o feriado cadastrado, o mesmo lançamento fica na faixa de 1,75.
  const sem = (await sim([lanc('EXTRA', '2026-10-12', '18:00', '19:00')])).simulacao;
  assert.equal(sem.trabalhoFimDeSemanaMinutes, 0);
  assert.equal(sem.trabalhoFaixaMinutes, 60);
});

test('atravessa a meia-noite de sexta para sábado: cada pedaço no seu dia', async () => {
  const s = (await sim([lanc('BIP_ATTENDANCE', '2026-10-09', '23:00', '01:00')])).simulacao;
  assert.equal(s.trabalhoFaixaMinutes, 60);
  assert.equal(s.trabalhoFaixaValue, 38.5);
  assert.equal(s.trabalhoFimDeSemanaMinutes, 60);
  assert.equal(s.trabalhoFimDeSemanaValue, 44);
});

test('sobreaviso a 1/3 exato: 3h = H; 1h = 7,33', async () => {
  const tres = (await sim([lanc('BIP_STANDBY', '2026-10-06', '09:00', '12:00')])).simulacao;
  assert.equal(tres.sobreavisoValue, 22);
  const uma = (await sim([lanc('BIP_STANDBY', '2026-10-06', '09:00', '10:00')])).simulacao;
  assert.equal(uma.sobreavisoValue, 7.33);
});

test('interseção parcial: escala 10–12, atendimento 11:30–12:30 → abate 30 min', async () => {
  const s = (
    await sim([
      lanc('BIP_STANDBY', '2026-10-06', '10:00', '12:00'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '11:30', '12:30'),
    ])
  ).simulacao;
  assert.equal(s.sobreavisoAbatidoMinutes, 30);
  assert.equal(s.sobreavisoLiquidoMinutes, 90);
  assert.equal(s.sobreavisoValue, 11);
  assert.equal(s.trabalhoFaixaValue, 38.5);
});

test('atendimentos sobrepostos: abate a união (90 min), não 120; sobreposição sinalizada', async () => {
  const s = (
    await sim([
      lanc('BIP_STANDBY', '2026-10-06', '10:00', '12:00'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '10:30', '11:30'),
      lanc('BIP_ATTENDANCE', '2026-10-06', '11:00', '12:00'),
    ])
  ).simulacao;
  assert.equal(s.sobreavisoAbatidoMinutes, 90);
  assert.equal(s.sobreavisoValue, 3.67); // 30 min × 22 ÷ 3
  assert.equal(s.trabalhoFaixaMinutes, 90);
  assert.equal(s.trabalhoFaixaValue, 57.75);
  assert.equal(s.avisos.minutosSobrepostosTrabalho, 30);
});

test('backup conta como sobreaviso (premissa pendente)', async () => {
  const s = (await sim([lanc('BIP_BACKUP', '2026-10-06', '09:00', '12:00')])).simulacao;
  assert.equal(s.parametros.backupComoSobreaviso, true);
  assert.equal(s.sobreavisoValue, 22);
});

test('pausa: intervalo encurtado pela duração gravada e sinalizado', async () => {
  const s = (
    await sim([lanc('EXTRA', '2026-10-06', '18:00', '21:00', { duration_minutes: 150, break_minutes: 30 })])
  ).simulacao;
  assert.equal(s.trabalhoFaixaMinutes, 120);
  assert.equal(s.trabalhoExcedenteMinutes, 30);
  assert.equal(s.avisos.comPausa, 1);
});

test('lançamento sem horário fica fora da simulação e é sinalizado', async () => {
  const semHora = { ...lanc('EXTRA', '2026-10-06', '18:00', '19:00'), start_time: '', end_time: '' };
  const s = (await sim([semHora])).simulacao;
  assert.equal(s.avisos.semHorario, 1);
  assert.equal(s.incrementalTotal, 0);
});

test('pendente não entra na simulação (como no oficial)', async () => {
  const s = (
    await sim([lanc('BIP_ATTENDANCE', '2026-10-06', '18:00', '19:00', { status: 'PENDING' })])
  ).simulacao;
  assert.equal(s.incrementalTotal, 0);
});

test('PJ não tem simulação (a CCT é de empregados)', async () => {
  const r = await sim([lanc('EXTRA', '2026-10-06', '18:00', '21:00')], {
    perfil: { contract_type: 'PJ' },
  });
  assert.equal(r.simulacao, null);
  assert.ok(r.incrementalTotal > 0); // o oficial continua calculado
});
