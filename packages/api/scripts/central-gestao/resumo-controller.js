// GET /resumo?mes=AAAA-MM — resumo da gestão no envelope de indicador do PRD 6.1.
// Só lê. Áreas sem fonte ou sem acesso vêm sem número (nunca 0). Uma área com falha não derruba as outras.
// Suporte, CRM e Horas são lidos pelas rotas de resumo deles, com o JWT de quem consulta (a permissão
// da fonte vale sozinha) e só totais voltam: nada de ticket, negócio, nome ou salário.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  var TZ = 'America/Sao_Paulo';
  var BASE = 'https://api.arara-tech.com';
  var q = ctx.query || {};
  var hoje = _hojeSP();

  var mes = hoje.slice(0, 7);
  if (q.mes !== undefined && q.mes !== '') {
    if (typeof q.mes !== 'string' || !/^\d{4}-\d{2}$/.test(q.mes)) {
      return _erro(ctx, 400, 'filtro_invalido', 'Período deve ser AAAA-MM.');
    }
    var am = Number(q.mes.slice(0, 4));
    var mm = Number(q.mes.slice(5, 7));
    if (am < 2000 || am > 2100 || mm < 1 || mm > 12) return _erro(ctx, 400, 'filtro_invalido', 'Período inválido.');
    mes = q.mes;
  }
  var ano = Number(mes.slice(0, 4));
  var m = Number(mes.slice(5, 7));
  var inicio = mes + '-01';
  var fim = (m === 12 ? ano + 1 + '-01' : ano + '-' + (m + 1 < 10 ? '0' : '') + (m + 1)) + '-01';

  // Envelope de um indicador. `valor` só é publicado quando o estado é ok.
  function ind(o, agora) {
    var per = o.tipo === 'periodo';
    var ok = o.state === 'ok';
    return {
      metric_key: o.key,
      label: o.label,
      unit: o.unit,
      value: ok && typeof o.valor === 'number' ? o.valor : null,
      tipo: o.tipo,
      source_key: o.source_key,
      source_label: o.source_label,
      universe: o.universo,
      period_start: per ? inicio : null,
      period_end: per ? fim : null,
      timezone: TZ,
      snapshot_at: !per && ok ? agora : null,
      last_success_at: ok ? agora : null,
      fetched_at: agora,
      state: o.state,
      reason_code: o.reason || null,
    };
  }
  function semFonte(key, label, state, reason) {
    return { area_key: key, label: label, state: state, reason_code: reason, indicadores: [] };
  }

  // Chama a rota de resumo de outra fonte com o JWT de quem consulta.
  async function consultar(caminho) {
    if (typeof ctx.fetch !== 'function') return { motivo: 'fonte_nao_configurada' };
    var auth = ctx.headers && typeof ctx.headers.authorization === 'string' ? ctx.headers.authorization : '';
    if (!auth) return { motivo: 'sem_permissao' };
    var res;
    try {
      res = await ctx.fetch(BASE + caminho, { method: 'GET', headers: { authorization: auth, accept: 'application/json' } });
    } catch (e) {
      var msg = String((e && e.message) || e);
      return { motivo: /allowlist|ALLOWLIST/.test(msg) ? 'fonte_nao_configurada' : 'falha_leitura' };
    }
    if (!res || typeof res.status !== 'number') return { motivo: 'falha_leitura' };
    if (res.status === 401 || res.status === 403) return { motivo: 'sem_permissao' };
    if (res.status === 404) return { motivo: 'fonte_nao_configurada' };
    if (res.status < 200 || res.status >= 300 || res.truncated) return { motivo: 'falha_leitura' };
    var corpo;
    try {
      corpo = JSON.parse(res.body);
    } catch (e) {
      return { motivo: 'falha_leitura' };
    }
    if (!corpo || corpo.complete !== true) return { motivo: 'leitura_incompleta' };
    return { corpo: corpo };
  }
  function estadoDe(motivo) {
    if (motivo === 'sem_permissao') return 'sem_permissao';
    if (motivo === 'fonte_nao_configurada') return 'sem_configuracao';
    return 'erro';
  }

  var resultados = await Promise.all([
    consultar('/v1/r/portal-suporte/tickets/resumo-gestao?mes=' + mes),
    consultar('/v1/r/portal-crm/vendas/resumo-gestao?mes=' + mes),
    consultar('/v1/r/portal-horas/hour-entries/resumo?month=' + mes),
  ]);
  var agoraFontes = _agora();

  // ── Tickets ──
  var rt = resultados[0];
  var tEstado = rt.corpo ? 'ok' : estadoDe(rt.motivo);
  var tc = rt.corpo || {};
  var tFonte = { source_key: 'portal-suporte.tickets', source_label: 'Portal de Suporte' };
  function tInd(o) {
    o.source_key = tFonte.source_key;
    o.source_label = tFonte.source_label;
    o.unit = 'tickets';
    if (o.state === undefined) {
      o.state = tEstado;
      o.reason = rt.motivo;
    }
    return ind(o, agoraFontes);
  }
  var UNIV_T = 'Quadro suporte, sem arquivados';
  var areaTickets = {
    area_key: 'tickets',
    label: 'Tickets',
    state: tEstado,
    reason_code: rt.corpo ? null : rt.motivo,
    indicadores: [
      tInd({ key: 'tickets.ativos', label: 'Ativos agora', tipo: 'agora', valor: tc.ativos,
        universo: UNIV_T + '; status novos chamados, triagem, em atendimento, em teste, aguardando cliente, pendência suporte e pendência dev' }),
      tInd({ key: 'tickets.sem_responsavel', label: 'Ativos sem responsável', tipo: 'agora', valor: tc.sem_responsavel,
        universo: 'Dentro de "Ativos agora", os que não têm responsável' }),
      tInd({ key: 'tickets.criados_periodo', label: 'Criados no período', tipo: 'periodo', valor: tc.criados_no_mes,
        universo: UNIV_T + '; data de criação (fuso de São Paulo) no período, qualquer status' }),
      tInd({ key: 'tickets.resolvidos_periodo', label: 'Resolvidos no período', tipo: 'periodo',
        state: 'definicao_pendente', reason: 'resolucao_sem_data_confiavel',
        universo: 'A data de resolução não é gravada em todas as mudanças de status do Suporte' }),
    ],
  };

  // ── Vendas ──
  var rv = resultados[1];
  var vEstado = rv.corpo ? 'ok' : estadoDe(rv.motivo);
  var vc = rv.corpo || {};
  var temMeta = rv.corpo && typeof vc.meta === 'number' && vc.meta > 0;
  function vInd(o) {
    o.source_key = 'portal-crm.vendas';
    o.source_label = 'CRM';
    o.tipo = 'periodo';
    if (o.state === undefined) {
      o.state = vEstado;
      o.reason = rv.motivo;
    }
    return ind(o, agoraFontes);
  }
  var areaVendas = {
    area_key: 'vendas',
    label: 'Vendas',
    state: vEstado,
    reason_code: rv.corpo ? null : rv.motivo,
    indicadores: [
      vInd({ key: 'vendas.vendido', label: 'Vendido no período', unit: 'BRL', valor: vc.vendido,
        universo: 'Soma do valor dos negócios ganhos com fechamento (fuso de São Paulo) no período, de todos os vendedores' }),
      vInd({ key: 'vendas.ganhos', label: 'Negócios ganhos', unit: 'negócios', valor: vc.ganhos,
        universo: 'Negócios com status ganho e fechamento no período' }),
      vInd(rv.corpo && !temMeta
        ? { key: 'vendas.meta', label: 'Meta da equipe', unit: 'BRL', state: 'sem_configuracao', reason: 'meta_nao_cadastrada',
            universo: 'Soma das metas do período, a mais recente de cada vendedor' }
        : { key: 'vendas.meta', label: 'Meta da equipe', unit: 'BRL', valor: vc.meta,
            universo: 'Soma das metas do período, a mais recente de cada vendedor' }),
      vInd(rv.corpo && !temMeta
        ? { key: 'vendas.atingimento', label: 'Atingimento da meta', unit: '%', state: 'sem_configuracao', reason: 'meta_nao_cadastrada',
            universo: 'Vendido ÷ meta da equipe' }
        : { key: 'vendas.atingimento', label: 'Atingimento da meta', unit: '%',
            valor: temMeta ? Math.round((vc.vendido / vc.meta) * 1000) / 10 : null,
            universo: 'Vendido ÷ meta da equipe' }),
    ],
  };

  // ── Horas ──
  var rh = resultados[2];
  var hEstado = rh.corpo ? 'ok' : estadoDe(rh.motivo);
  var hc = rh.corpo || {};
  function hInd(o) {
    o.source_key = 'portal-horas.lancamentos';
    o.source_label = 'Gestão de Horas';
    o.tipo = 'periodo';
    if (o.state === undefined) {
      o.state = hEstado;
      o.reason = rh.motivo;
    }
    return ind(o, agoraFontes);
  }
  var UNIV_H = 'Lançamentos do período, fora os de administradores';
  var areaHoras = {
    area_key: 'horas',
    label: 'Horas e custo',
    state: hEstado,
    reason_code: rh.corpo ? null : rh.motivo,
    indicadores: [
      hInd({ key: 'horas.aprovadas', label: 'Horas aprovadas', unit: 'minutos', valor: hc.approved_minutes,
        universo: UNIV_H + '; status aprovado ou ajustado, todos os tipos de hora' }),
      hInd({ key: 'horas.pendentes', label: 'Horas pendentes', unit: 'minutos', valor: hc.pending_minutes,
        universo: UNIV_H + '; status pendente' }),
      hInd({ key: 'horas.analistas', label: 'Analistas', unit: 'pessoas', valor: hc.analysts,
        universo: UNIV_H + '; pessoas com ao menos um lançamento' }),
      hInd(rh.corpo && hc.avg_approved_minutes_per_analyst == null
        ? { key: 'horas.media', label: 'Média por analista', unit: 'minutos', state: 'ok', reason: 'sem_analistas', valor: null,
            universo: 'Horas aprovadas ÷ analistas' }
        : { key: 'horas.media', label: 'Média por analista', unit: 'minutos', valor: hc.avg_approved_minutes_per_analyst,
            universo: 'Horas aprovadas ÷ analistas' }),
      hInd({ key: 'horas.custo', label: 'Custo agregado', unit: 'BRL', state: 'definicao_pendente', reason: 'custo_a_validar',
        universo: 'Acesso ao custo agregado a validar' }),
    ],
  };

  // ── Marketing (base própria da Central) ──
  var agora = _agora();
  var areaMkt;
  if (!ctx.models.RegistroMarketing) {
    areaMkt = semFonte('marketing', 'Marketing', 'sem_configuracao', 'base_nao_cadastrada');
  } else {
    var mv = null;
    var mEstado = 'ok';
    var mMotivo = null;
    try {
      var rm = await _lerTodos(ctx.models.RegistroMarketing, {});
      if (!rm.completo) {
        mEstado = 'erro';
        mMotivo = 'leitura_incompleta';
      } else {
        mv = { criados: 0, abertos: 0 };
        for (var x = 0; x < rm.itens.length; x++) {
          var reg = rm.itens[x];
          if (typeof reg.titulo !== 'string') continue;
          if (reg.status === 'planejado' || reg.status === 'em_andamento') mv.abertos += 1;
          var dc = new Date(reg.criado_em);
          if (!isNaN(dc.getTime())) {
            var diaC = _dataSP(dc);
            if (diaC >= inicio && diaC < fim) mv.criados += 1;
          }
        }
      }
    } catch (e) {
      mEstado = 'erro';
      mMotivo = 'falha_leitura';
      mv = null;
    }
    var mFonte = { source_key: 'central-gestao.marketing', source_label: 'Marketing (base da Central)', unit: 'registros' };
    areaMkt = {
      area_key: 'marketing', label: 'Marketing', state: mEstado, reason_code: mMotivo,
      indicadores: [
        ind({ key: 'marketing.criados_periodo', label: 'Registros criados no período', tipo: 'periodo', unit: mFonte.unit,
          source_key: mFonte.source_key, source_label: mFonte.source_label, state: mEstado, reason: mMotivo, valor: mv && mv.criados,
          universo: 'Registros de marketing da Central com data de criação (fuso de São Paulo) no período, em qualquer status' }, agora),
        ind({ key: 'marketing.nao_concluidos', label: 'Não concluídos', tipo: 'agora', unit: mFonte.unit,
          source_key: mFonte.source_key, source_label: mFonte.source_label, state: mEstado, reason: mMotivo, valor: mv && mv.abertos,
          universo: 'Registros de marketing da Central com status Planejado ou Em andamento' }, agora),
      ],
    };
  }

  // ── Kanban da gestão ──
  var defs = [
    { key: 'kanban.para_decidir', label: 'Para decidir', tipo: 'agora', universo: 'Cartões não arquivados com status Para decidir' },
    { key: 'kanban.em_andamento', label: 'Em andamento', tipo: 'agora', universo: 'Cartões não arquivados com status Em andamento' },
    { key: 'kanban.aguardando', label: 'Aguardando', tipo: 'agora', universo: 'Cartões não arquivados com status Aguardando' },
    { key: 'kanban.concluidos_periodo', label: 'Concluídos no período', tipo: 'periodo', universo: 'Cartões não arquivados concluídos com data de conclusão (fuso de São Paulo) no período' },
    { key: 'kanban.vencidos', label: 'Vencidos não concluídos', tipo: 'agora', universo: 'Cartões não arquivados com prazo anterior a hoje e status diferente de Concluído' },
  ];
  var valores = null;
  var estado = 'ok';
  var motivo = null;
  try {
    if (!ctx.models.Cartao) throw new Error('sem model');
    var r = await _lerTodos(ctx.models.Cartao, { arquivado: false });
    if (!r.completo) {
      estado = 'erro';
      motivo = 'leitura_incompleta';
    } else {
      valores = { 'kanban.para_decidir': 0, 'kanban.em_andamento': 0, 'kanban.aguardando': 0, 'kanban.concluidos_periodo': 0, 'kanban.vencidos': 0 };
      for (var i = 0; i < r.itens.length; i++) {
        var c = r.itens[i];
        if (c.arquivado === true) continue;
        if (c.status === 'para_decidir') valores['kanban.para_decidir'] += 1;
        else if (c.status === 'em_andamento') valores['kanban.em_andamento'] += 1;
        else if (c.status === 'aguardando') valores['kanban.aguardando'] += 1;
        if (_vencido(c, hoje)) valores['kanban.vencidos'] += 1;
        if (c.status === 'concluido' && c.concluido_em) {
          var dt = new Date(c.concluido_em);
          if (!isNaN(dt.getTime())) {
            var dia = _dataSP(dt);
            if (dia >= inicio && dia < fim) valores['kanban.concluidos_periodo'] += 1;
          }
        }
      }
    }
  } catch (e) {
    estado = 'erro';
    motivo = 'falha_leitura';
    valores = null;
  }
  var indicadores = [];
  for (var j = 0; j < defs.length; j++) {
    var d = defs[j];
    indicadores.push(ind({ key: d.key, label: d.label, tipo: d.tipo, unit: 'cartões', universo: d.universo,
      source_key: 'central-gestao.kanban', source_label: 'Kanban da gestão', state: estado, reason: motivo,
      valor: valores ? valores[d.key] : null }, agora));
  }

  return ctx.reply.status(200).send({
    gerado_em: agora,
    timezone: TZ,
    periodo: { inicio: inicio, fim: fim, mes: mes },
    areas: [
      areaTickets,
      areaMkt,
      areaVendas,
      areaHoras,
      { area_key: 'kanban', label: 'Kanban da gestão', state: estado, reason_code: motivo, indicadores: indicadores },
    ],
  });
}
