/**
 * GET /finance/investment-calculator?month=YYYY-MM
 * Identity from JWT (ctx.user.id). Admin Horas sees all staff users; others only self.
 */
async function handler(ctx) {
  const HOUR_TYPES = {
    NORMAL: 'NORMAL',
    EXTRA: 'EXTRA',
    BIP_STANDBY: 'BIP_STANDBY',
    BIP_ATTENDANCE: 'BIP_ATTENDANCE',
    BIP_BACKUP: 'BIP_BACKUP',
  };
  const COUNT_STATUSES = ['APPROVED', 'ADJUSTED'];
  const MONTHLY_REFERENCE_HOURS = 168;
  // CLT: carga fixa de 200 h/mês — é a meta e o divisor do valor hora.
  const CLT_MONTHLY_HOURS = 200;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }
  function asHours(min) {
    return Number((Number(min || 0) / 60).toFixed(2));
  }
  function toMoney(v) {
    return Number(Number(v || 0).toFixed(2));
  }
  function pick(obj, snake, camel) {
    return obj[snake] != null ? obj[snake] : obj[camel];
  }
  function countWorkingDays(year, monthNum, holidaySet) {
    const lastDay = new Date(year, monthNum, 0).getDate();
    let count = 0;
    for (let d = 1; d <= lastDay; d += 1) {
      const ymd = year + '-' + pad2(monthNum) + '-' + pad2(d);
      const dow = new Date(Date.UTC(year, monthNum - 1, d)).getUTCDay();
      if (dow === 0 || dow === 6) continue;
      if (holidaySet.has(ymd)) continue;
      count += 1;
    }
    return count;
  }
  function isClt(user) {
    return String(pick(user, 'contract_type', 'contractType') || '').trim().toUpperCase() === 'CLT';
  }
  // ── Aritmética exata ─────────────────────────────────────────────────────
  // Valor hora como fração (num/den, em reais por hora). Minutos inteiros são
  // somados por rubrica antes de qualquer conta; cada rubrica é arredondada uma
  // única vez para centavos (meio para cima). Agregados e totais são somas de
  // rubricas já arredondadas. Nada de float no dinheiro.
  const RUBRICAS = [
    { key: 'extra', type: HOUR_TYPES.EXTRA, fnum: 1n, fden: 1n },
    { key: 'attendance', type: HOUR_TYPES.BIP_ATTENDANCE, fnum: 1n, fden: 1n },
    { key: 'standby', type: HOUR_TYPES.BIP_STANDBY, fnum: 3n, fden: 10n },
    { key: 'backup', type: HOUR_TYPES.BIP_BACKUP, fnum: 3n, fden: 10n },
  ];
  function toCents(v) {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? BigInt(Math.round(n * 100)) : 0n;
  }
  function centsToNumber(c) {
    return Number(c) / 100;
  }
  // Origem da remuneração = "Tipo de remuneração" do cadastro (rate_type).
  function rateOrigin(user) {
    const t = String(pick(user, 'rate_type', 'rateType') || '').trim().toLowerCase();
    return t === 'monthly' || t === 'hourly' ? t : null;
  }
  // { num, den, origin, pending }: valor hora = num/den reais.
  // monthly → mensal ÷ divisor exato; hourly → hora gravada.
  // Sem origem (legado): hora gravada prevalece, senão mensal ÷ divisor; com os
  // dois valores, pending (revisar). Origem sem o valor dela também é pending.
  function resolveRate(user) {
    const divisor = BigInt(isClt(user) ? CLT_MONTHLY_HOURS : MONTHLY_REFERENCE_HOURS);
    const monthlyCents = toCents(pick(user, 'monthly_rate', 'monthlyRate'));
    const hr = Number(pick(user, 'hourly_rate', 'hourlyRate') || 0);
    const hourlyMicros = Number.isFinite(hr) && hr > 0 ? BigInt(Math.round(hr * 1e6)) : 0n;
    const origin = rateOrigin(user);
    if (origin === 'monthly' && monthlyCents > 0n) {
      return { num: monthlyCents, den: 100n * divisor, origin, pending: false };
    }
    if (origin === 'hourly' && hourlyMicros > 0n) {
      return { num: hourlyMicros, den: 1000000n, origin, pending: false };
    }
    const inconsistent = origin !== null;
    if (hourlyMicros > 0n) {
      return {
        num: hourlyMicros,
        den: 1000000n,
        origin,
        pending: inconsistent || monthlyCents > 0n,
      };
    }
    if (monthlyCents > 0n) {
      return { num: monthlyCents, den: 100n * divisor, origin, pending: inconsistent };
    }
    return { num: 0n, den: 1n, origin, pending: inconsistent };
  }
  function rubricaCents(minutes, rate, fnum, fden) {
    if (minutes <= 0 || rate.num === 0n) return 0n;
    const n = BigInt(minutes) * rate.num * fnum * 100n;
    const d = 60n * rate.den * fden;
    return (2n * n + d) / (2n * d); // meio para cima (valores ≥ 0)
  }
  function computeIncremental(byType, rate) {
    const r = {};
    let incCents = 0n;
    let incMinutes = 0;
    for (const rb of RUBRICAS) {
      const minutes = byType[rb.type] || 0;
      const cents = rubricaCents(minutes, rate, rb.fnum, rb.fden);
      r[rb.key] = { minutes, cents };
      incCents += cents;
      incMinutes += minutes;
    }
    const eaMinutes = r.extra.minutes + r.attendance.minutes;
    const sbMinutes = r.standby.minutes + r.backup.minutes;
    return {
      rubricas: r,
      eaMinutes,
      eaCents: r.extra.cents + r.attendance.cents,
      sbMinutes,
      sbCents: r.standby.cents + r.backup.cents,
      incMinutes,
      incCents,
    };
  }
  // ── Regra da CCT SINDPD-SP 2026/2027 (CLT, a partir de outubro/2026) ──────
  // Desenho: 2026-11-06-desenho-horas-cct-oficial. Confirmado com o escritório
  // em 06/11/2026: em dia útil, as 2 primeiras horas de trabalho do dia a 1,75×
  // e as demais do mesmo dia a 2×; sábado, domingo e feriado a 2×; hora extra e
  // atendimento dividem a faixa do dia; sobreaviso (BIP) a 1/3, acumulando com
  // o atendimento; backup não é sobreaviso e mantém 1/3 em rubrica própria.
  // O sobreaviso usa o coeficiente 0,333 da rubrica da folha (o campo aceita
  // 3 casas), para o valor daqui bater com o holerite.
  // PJ e meses anteriores à vigência seguem as RUBRICAS acima.
  const CCT = {
    id: 'cct-sindpd-sp-2026',
    vigencia: '2026-10',
    faixaMinutos: 120,
    fatorFaixa: [7n, 4n], // 1,75
    fatorExcedente: [2n, 1n], // 2,0
    fatorFimDeSemana: [2n, 1n], // 2,0
    fatorSobreaviso: [333n, 1000n], // 0,333, o coeficiente da folha
    fatorBackup: [1n, 3n], // 1/3 exato
  };
  function usaCct(user, ym) {
    return isClt(user) && ym >= CCT.vigencia;
  }
  function minutoDoDia(hhmm) {
    const m = /^(\d{1,2}):(\d{2})/.exec(String(hhmm || ''));
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h > 23 || min > 59) return null;
    return h * 60 + min;
  }
  function diaDe(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
    if (!m) return null;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
  }
  function ymdDe(dia) {
    return new Date(dia * 86400000).toISOString().slice(0, 10);
  }
  function uniao(ivs) {
    const s = ivs.filter((x) => x.end > x.start).sort((a, b) => a.start - b.start);
    const out = [];
    for (const iv of s) {
      const ult = out[out.length - 1];
      if (ult && iv.start <= ult.end) ult.end = Math.max(ult.end, iv.end);
      else out.push({ start: iv.start, end: iv.end });
    }
    return out;
  }
  function soma(ivs) {
    return ivs.reduce((t, iv) => t + (iv.end - iv.start), 0);
  }
  // Corta na meia-noite: cada pedaço pertence ao próprio dia.
  function porDia(ivs) {
    const out = [];
    for (const iv of ivs) {
      let s = iv.start;
      while (s < iv.end) {
        const dia = Math.floor(s / 1440);
        const e = Math.min(iv.end, (dia + 1) * 1440);
        out.push({ dia, len: e - s });
        s = e;
      }
    }
    return out;
  }
  // Lançamentos de um grupo → minutos por dia. Com horário válido, vira
  // intervalo absoluto (dia × 1440 + minuto; a pausa sai do fim) e entra na
  // união do grupo (minuto repetido conta uma vez). Sem horário válido, a
  // duração inteira fica no dia da data. Duração inválida já foi descartada.
  function minutosDoGrupo(entries, avisos) {
    const ivs = [];
    const soltos = [];
    for (const e of entries) {
      const dur = Number(pick(e, 'duration_minutes', 'durationMinutes') || 0);
      const dia = diaDe(pick(e, 'date', 'date'));
      if (dia === null || dur === 0) continue;
      const ini = minutoDoDia(pick(e, 'start_time', 'startTime'));
      const fim = minutoDoDia(pick(e, 'end_time', 'endTime'));
      if (ini === null || fim === null || ini === fim) {
        avisos.semHorario += 1;
        soltos.push({ dia, len: dur });
        continue;
      }
      const bruto = fim > ini ? fim - ini : fim + 1440 - ini;
      if (dur < bruto) avisos.comPausa += 1;
      if (dur > bruto) {
        avisos.duracaoMaiorQueHorario += 1;
        avisos.minutosForaPorHorario += dur - bruto;
      }
      const start = dia * 1440 + ini;
      ivs.push({ start, end: start + Math.min(dur, bruto) });
    }
    const unidos = uniao(ivs);
    avisos.minutosSobrepostos += soma(ivs) - soma(unidos);
    return porDia(unidos).concat(soltos);
  }
  // entries já filtrados por status e com duração válida (ver aggregateMinutes).
  function computeCct(entries, rate, feriados) {
    const avisos = {
      semHorario: 0,
      comPausa: 0,
      duracaoMaiorQueHorario: 0,
      minutosForaPorHorario: 0,
      minutosSobrepostos: 0,
    };
    const grupos = { trabalho: [], sobreaviso: [], backup: [] };
    for (const e of entries) {
      const t = pick(e, 'hour_type', 'hourType');
      if (t === HOUR_TYPES.EXTRA || t === HOUR_TYPES.BIP_ATTENDANCE) grupos.trabalho.push(e);
      else if (t === HOUR_TYPES.BIP_STANDBY) grupos.sobreaviso.push(e);
      else if (t === HOUR_TYPES.BIP_BACKUP) grupos.backup.push(e);
    }
    // Trabalho: soma por dia; em dia útil a faixa de 2h é do dia inteiro.
    const diaUtil = {};
    let fimDeSemana = 0;
    for (const p of minutosDoGrupo(grupos.trabalho, avisos)) {
      const dow = (((p.dia + 4) % 7) + 7) % 7; // 1970-01-01 = quinta; 0 = domingo
      if (dow === 0 || dow === 6 || feriados.has(ymdDe(p.dia))) fimDeSemana += p.len;
      else diaUtil[p.dia] = (diaUtil[p.dia] || 0) + p.len;
    }
    let faixa = 0;
    let excedente = 0;
    for (const dia of Object.keys(diaUtil)) {
      const naFaixa = Math.min(diaUtil[dia], CCT.faixaMinutos);
      faixa += naFaixa;
      excedente += diaUtil[dia] - naFaixa;
    }
    const total = (ps) => ps.reduce((t, p) => t + p.len, 0);
    const sobreaviso = total(minutosDoGrupo(grupos.sobreaviso, avisos));
    const backup = total(minutosDoGrupo(grupos.backup, avisos));

    const r = {};
    const pares = [
      ['faixa', faixa, CCT.fatorFaixa],
      ['excedente', excedente, CCT.fatorExcedente],
      ['fimDeSemana', fimDeSemana, CCT.fatorFimDeSemana],
      ['sobreaviso', sobreaviso, CCT.fatorSobreaviso],
      ['backup', backup, CCT.fatorBackup],
    ];
    for (const [k, minutes, f] of pares) {
      r[k] = { minutes, cents: rubricaCents(minutes, rate, f[0], f[1]) };
    }
    const eaMinutes = faixa + excedente + fimDeSemana;
    const eaCents = r.faixa.cents + r.excedente.cents + r.fimDeSemana.cents;
    const sbMinutes = sobreaviso + backup;
    const sbCents = r.sobreaviso.cents + r.backup.cents;
    return {
      rubricas: r,
      eaMinutes,
      eaCents,
      sbMinutes,
      sbCents,
      incMinutes: eaMinutes + sbMinutes,
      incCents: eaCents + sbCents,
      avisos,
    };
  }
  function cctResposta(c) {
    const r = c.rubricas;
    const out = { regra: CCT.id };
    for (const k of ['faixa', 'excedente', 'fimDeSemana', 'sobreaviso', 'backup']) {
      out[k + 'Minutes'] = r[k].minutes;
      out[k + 'Value'] = centsToNumber(r[k].cents);
    }
    out.avisos = c.avisos;
    return out;
  }
  // Soma minutos inteiros por tipo. Duração negativa, fracionária ou não
  // numérica fica fora da conta e é contada em `ignored`; `valid` são os
  // lançamentos que entram (a regra da CCT parte deles).
  function aggregateMinutes(entries) {
    const byType = {};
    const valid = [];
    let ignored = 0;
    for (const e of entries) {
      const minutes = Number(pick(e, 'duration_minutes', 'durationMinutes') || 0);
      if (!Number.isInteger(minutes) || minutes < 0) {
        ignored += 1;
        continue;
      }
      valid.push(e);
      const t = pick(e, 'hour_type', 'hourType');
      byType[t] = (byType[t] || 0) + minutes;
    }
    return { byType, valid, ignored };
  }
  function emptyTotals() {
    return {
      basePayment: 0,
      extraAndAttendanceHours: 0,
      extraAndAttendanceValue: 0,
      standbyAndBackupHours: 0,
      standbyAndBackupValue: 0,
      normalHours: 0,
      incrementalHours: 0,
      incrementalTotal: 0,
      totalCost: 0,
      pendingIncrementalCost: 0,
    };
  }

  const month = String((ctx.query && ctx.query.month) || '');
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return ctx.reply.status(400).send({ error: 'Invalid month' });
  }
  const [ys, ms] = month.split('-');
  const year = Number(ys);
  const monthNum = Number(ms);
  if (monthNum < 1 || monthNum > 12) {
    return ctx.reply.status(400).send({ error: 'Invalid month' });
  }

  const monthStart = year + '-' + pad2(monthNum) + '-01';
  const lastDate = new Date(year, monthNum, 0);
  const monthEnd = year + '-' + pad2(monthNum) + '-' + pad2(lastDate.getDate());

  const Profile = ctx.models.StaffProfile;
  const HourEntries = ctx.models.HourEntries;
  const Holidays = ctx.models.Holidays;
  if (!Profile || !HourEntries || !Holidays) {
    return ctx.reply.status(500).send({ error: 'Required models missing' });
  }

  const requester = ctx.user;
  if (!requester || !requester.id) {
    return ctx.reply.status(401).send({ error: 'Login required for finance data' });
  }

  const allHolidays = await Holidays.findMany({ limit: 500 });
  const holidaySet = new Set();
  for (const h of allHolidays) {
    const d = String(pick(h, 'date', 'date') || '').slice(0, 10);
    if (d >= monthStart && d <= monthEnd) holidaySet.add(d);
  }

  const workingDays = countWorkingDays(year, monthNum, holidaySet);
  // Todos os feriados (a regra da CCT classifica pedaços que passam da virada do mês).
  const feriados = new Set(
    allHolidays.map((h) => String(pick(h, 'date', 'date') || '').slice(0, 10)),
  );
  const expectedHours = Number((workingDays * 8).toFixed(2));
  const baseMeta = {
    month,
    monthStart,
    monthEnd,
    workingDaysInMonth: workingDays,
    expectedHoursDefault: expectedHours,
  };

  const self = await Profile.findById(String(requester.id));
  const roles = (requester && requester.roles) || [];
  const selfRole = String((self && pick(self, 'role', 'role')) || '');
  // Admin view: platform admin OR Horas admin/master (legacy "role=user" staff filter broke after canonical roles).
  const isAdmin =
    roles.indexOf('admin') >= 0 || selfRole === 'admin' || selfRole === 'master';

  function isFinanceStaff(u) {
    if (pick(u, 'active', 'active') === false) return false;
    const r = String(pick(u, 'role', 'role') || '').toLowerCase();
    // Exclude platform/Horas admins from the company rollup; include support/developer/user/etc.
    if (r === 'admin' || r === 'master') return false;
    return true;
  }

  let profiles;
  if (isAdmin) {
    const all = await Profile.findMany({ limit: 500 });
    profiles = all.filter(isFinanceStaff);
  } else {
    if (!self) return ctx.reply.status(403).send({ error: 'No finance data for this user' });
    profiles = [self];
  }

  if (!profiles.length) {
    return ctx.reply.send(Object.assign({}, baseMeta, { rows: [], totals: emptyTotals() }));
  }

  const rows = [];
  let totals = emptyTotals();
  const acc = {
    baseCents: 0n,
    normalMinutes: 0,
    eaMinutes: 0,
    eaCents: 0n,
    sbMinutes: 0,
    sbCents: 0n,
    incMinutes: 0,
    incCents: 0n,
    totalCents: 0n,
    pendingCents: 0n,
  };

  for (const u of profiles) {
    const userId = String(u.id);
    // Prefer snake filter; also accept camel if storage uses it. Cap high enough for month rollups.
    let allEntries = await HourEntries.findMany({ user_id: userId, limit: 2000 });
    if (!allEntries.length) {
      allEntries = await HourEntries.findMany({ userId: userId, limit: 2000 });
    }
    const inMonth = allEntries.filter((e) => {
      const d = String(pick(e, 'date', 'date') || '').slice(0, 10);
      const uid = String(pick(e, 'user_id', 'userId') || '');
      if (uid && uid !== userId) return false;
      return d >= monthStart && d <= monthEnd;
    });
    const approved = inMonth.filter((e) =>
      COUNT_STATUSES.includes(String(pick(e, 'status', 'status') || '')),
    );
    const pending = inMonth.filter((e) => String(pick(e, 'status', 'status') || '') === 'PENDING');

    const approvedAgg = aggregateMinutes(approved);
    const pendingAgg = aggregateMinutes(pending);
    const byType = approvedAgg.byType;
    const normalMinutes = byType[HOUR_TYPES.NORMAL] || 0;
    const rate = resolveRate(u);
    const cct = usaCct(u, month);
    const inc = cct
      ? computeCct(approvedAgg.valid, rate, feriados)
      : computeIncremental(byType, rate);
    const pendingCents = cct
      ? computeCct(pendingAgg.valid, rate, feriados).incCents
      : computeIncremental(pendingAgg.byType, rate).incCents;
    const baseCents = toCents(pick(u, 'monthly_rate', 'monthlyRate'));
    const totalCents = baseCents + inc.incCents;
    const rb = inc.rubricas;

    rows.push({
      userId,
      fullName: pick(u, 'full_name', 'fullName') || u.email,
      email: u.email,
      squad: pick(u, 'squad', 'squad') || null,
      rateType: pick(u, 'rate_type', 'rateType') || null,
      rateOrigin: rate.origin,
      rateOriginPending: rate.pending,
      contractType: isClt(u) ? 'CLT' : 'PJ',
      regraCalculo: cct ? CCT.id : 'padrao',
      monthlyRate:
        pick(u, 'monthly_rate', 'monthlyRate') != null
          ? Number(pick(u, 'monthly_rate', 'monthlyRate'))
          : null,
      referenceHourlyRate: toMoney(Number(rate.num) / Number(rate.den)),
      hasRateWarning: rate.num === 0n,
      workingDaysInMonth: workingDays,
      expectedHours: isClt(u) ? CLT_MONTHLY_HOURS : expectedHours,
      normalHours: asHours(normalMinutes),
      // Na CCT a faixa é do dia, não do tipo: hora extra e atendimento não têm
      // valor separado (os minutos lançados continuam aqui).
      extraMinutes: byType[HOUR_TYPES.EXTRA] || 0,
      extraValue: cct ? null : centsToNumber(rb.extra.cents),
      attendanceMinutes: byType[HOUR_TYPES.BIP_ATTENDANCE] || 0,
      attendanceValue: cct ? null : centsToNumber(rb.attendance.cents),
      standbyMinutes: cct ? rb.sobreaviso.minutes : rb.standby.minutes,
      standbyValue: centsToNumber(cct ? rb.sobreaviso.cents : rb.standby.cents),
      backupMinutes: rb.backup.minutes,
      backupValue: centsToNumber(rb.backup.cents),
      extraAndAttendanceHours: asHours(inc.eaMinutes),
      extraAndAttendanceValue: centsToNumber(inc.eaCents),
      standbyAndBackupHours: asHours(inc.sbMinutes),
      standbyAndBackupValue: centsToNumber(inc.sbCents),
      incrementalHours: asHours(inc.incMinutes),
      incrementalTotal: centsToNumber(inc.incCents),
      basePayment: centsToNumber(baseCents),
      totalCost: centsToNumber(totalCents),
      pendingIncrementalCost: centsToNumber(pendingCents),
      ignoredEntries: approvedAgg.ignored + pendingAgg.ignored,
      cct: cct ? cctResposta(inc) : null,
    });

    acc.baseCents += baseCents;
    acc.normalMinutes += normalMinutes;
    acc.eaMinutes += inc.eaMinutes;
    acc.eaCents += inc.eaCents;
    acc.sbMinutes += inc.sbMinutes;
    acc.sbCents += inc.sbCents;
    acc.incMinutes += inc.incMinutes;
    acc.incCents += inc.incCents;
    acc.totalCents += totalCents;
    acc.pendingCents += pendingCents;
  }

  totals = {
    basePayment: centsToNumber(acc.baseCents),
    extraAndAttendanceHours: asHours(acc.eaMinutes),
    extraAndAttendanceValue: centsToNumber(acc.eaCents),
    standbyAndBackupHours: asHours(acc.sbMinutes),
    standbyAndBackupValue: centsToNumber(acc.sbCents),
    normalHours: asHours(acc.normalMinutes),
    incrementalHours: asHours(acc.incMinutes),
    incrementalTotal: centsToNumber(acc.incCents),
    totalCost: centsToNumber(acc.totalCents),
    pendingIncrementalCost: centsToNumber(acc.pendingCents),
  };

  rows.sort((a, b) => String(a.fullName).localeCompare(String(b.fullName)));
  return ctx.reply.send(Object.assign({}, baseMeta, { rows, totals }));
}
module.exports = { handler };
