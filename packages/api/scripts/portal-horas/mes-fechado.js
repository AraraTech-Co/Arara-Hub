  // <mes-fechado> Fechamento de mês (desenho 2026-11-24-desenho-horas-fechamento-mes).
  // Mesmo texto em todas as rotas que gravam lançamentos; a fonte é
  // packages/api/scripts/portal-horas/mes-fechado.js e o teste
  // trava-mes-fechado.test.mjs confere que as cópias são iguais.
  // Sem o model MonthClosures nenhum mês pode ter sido fechado: segue aberto.
  // Falha na leitura propaga; quem chama responde 503 (na dúvida, não grava).
  async function mesFechado(data) {
    var M = ctx.models.MonthClosures;
    if (!M) return false;
    var mes = String(data || '').slice(0, 7);
    if (!/^\d{4}-\d{2}$/.test(mes)) return false;
    var r = await M.findById(mes);
    return !!(r && String(r.status || '') === 'fechado');
  }
  function recusaMesFechado(data) {
    return ctx.reply.status(409).send({ error: 'mes_fechado', month: String(data || '').slice(0, 7) });
  }
  function recusaLeituraFechamento() {
    return ctx.reply.status(503).send({ error: 'leitura_fechamento' });
  }
  // </mes-fechado>
