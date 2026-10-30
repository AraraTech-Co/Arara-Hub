async function handler(ctx) {
  var P = ctx.models.Projeto, A = ctx.models.Arquivo;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });
  if (!A) return ctx.reply.status(404).send({ error: "Material não encontrado" });

  var projetoId = String(ctx.params.id || "");
  var m = await A.findById(String(ctx.params.mid || ""));
  if (!m || String(m.escopo || "") !== ESCOPO_MATERIAL
      || String(m.projeto_id || "") !== projetoId
      || m.apagado_em) {
    return ctx.reply.status(404).send({ error: "Material não encontrado" });
  }

  // Quem enviou apaga o que enviou; fora isso, só quem planeja. Mesma régua do
  // acervo, onde o dono nunca fica trancado fora do próprio material.
  var sou = String(eu.id || "");
  if (!(sou && String(m.dono_id || "") === sou) && !_podePlanejar(eu)) {
    return ctx.reply.status(403).send({ error: "Só quem enviou o material, ou quem planeja o projeto, pode apagá-lo" });
  }

  // Apagar é LÓGICO: apagar de verdade levaria junto o histórico de quem
  // subiu o quê. `apagado_em` é o estado do material — `ativo` fica de fora de
  // propósito, para o material não entrar no filtro da listagem do acervo.
  await A.update(String(m.id), { apagado_em: _agora() });
  await _log(ctx, eu, "material_apagado", projetoId, "", { id: m.id, nome: m.nome });
  return ctx.reply.send({ success: true, data: { id: m.id } });
}
module.exports = { handler };
