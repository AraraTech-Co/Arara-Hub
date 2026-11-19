// GET /resumo?mes=AAAA-MM — resumo da gestão, no envelope de indicador do PRD 6.1.
// Só lê. As áreas sem fonte vêm sem número (nunca 0). Falha no Kanban não derruba as outras.
async function _rota(ctx) {
  var g = await _guarda(ctx);
  if (g.resposta) return g.resposta;
  var TZ = 'America/Sao_Paulo';
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

  var agora = _agora();
  function semFonte(key, label, state, reason) {
    return { area_key: key, label: label, state: state, reason_code: reason, indicadores: [] };
  }

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
    var porPeriodo = d.tipo === 'periodo';
    indicadores.push({
      metric_key: d.key,
      label: d.label,
      unit: 'cartões',
      value: valores ? valores[d.key] : null,
      tipo: d.tipo,
      source_key: 'central-gestao.kanban',
      source_label: 'Kanban da gestão',
      universe: d.universo,
      period_start: porPeriodo ? inicio : null,
      period_end: porPeriodo ? fim : null,
      timezone: TZ,
      snapshot_at: porPeriodo || !valores ? null : agora,
      last_success_at: valores ? agora : null,
      fetched_at: agora,
      state: estado,
      reason_code: motivo,
    });
  }

  // Marketing (base própria da Central). Sem o model: "base ainda não cadastrada", sem número.
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
    function indMkt(key, label, tipo, universo, valor) {
      var per = tipo === 'periodo';
      return {
        metric_key: key, label: label, unit: 'registros', value: mv ? valor : null, tipo: tipo,
        source_key: 'central-gestao.marketing', source_label: 'Marketing (base da Central)', universe: universo,
        period_start: per ? inicio : null, period_end: per ? fim : null, timezone: TZ,
        snapshot_at: per || !mv ? null : agora, last_success_at: mv ? agora : null, fetched_at: agora,
        state: mEstado, reason_code: mMotivo,
      };
    }
    areaMkt = {
      area_key: 'marketing', label: 'Marketing', state: mEstado, reason_code: mMotivo,
      indicadores: [
        indMkt('marketing.criados_periodo', 'Registros criados no período', 'periodo',
          'Registros de marketing da Central com data de criação (fuso de São Paulo) no período, em qualquer status', mv && mv.criados),
        indMkt('marketing.nao_concluidos', 'Não concluídos', 'agora',
          'Registros de marketing da Central com status Planejado ou Em andamento', mv && mv.abertos),
      ],
    };
  }

  return ctx.reply.status(200).send({
    gerado_em: agora,
    timezone: TZ,
    periodo: { inicio: inicio, fim: fim, mes: mes },
    areas: [
      semFonte('tickets', 'Tickets', 'definicao_pendente', 'universo_a_definir'),
      areaMkt,
      semFonte('vendas', 'Vendas', 'sem_configuracao', 'fonte_nao_configurada'),
      semFonte('horas', 'Horas e custo', 'sem_configuracao', 'fonte_nao_configurada'),
      { area_key: 'kanban', label: 'Kanban da gestão', state: estado, reason_code: motivo, indicadores: indicadores },
    ],
  });
}
