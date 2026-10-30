async function handler(ctx) {
  var P = ctx.models.Projeto, A = ctx.models.Arquivo, C = ctx.models.ArquivoConteudo;
  if (!P) return ctx.reply.status(500).send({ error: "Model Projeto missing" });
  var eu = await _perfilDe(ctx);
  if (!_podeVer(eu)) return ctx.reply.status(403).send({ error: "Sem permissão para ver projetos" });
  if (!A || !C) {
    return ctx.reply.status(503).send({ error: "O repositório de arquivos não está configurado neste portal" });
  }

  var projetoId = String(ctx.params.id || "");
  var p = await P.findById(projetoId);
  if (!p) return ctx.reply.status(404).send({ error: "Projeto não encontrado" });

  var b = ctx.body || {};
  // Mesmas limpezas do acervo: nome vira `download="..."` no navegador, e
  // `..`, barra e caractere de controle não têm o que fazer ali.
  var nome = String(b.nome || "").trim()
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[\\/]/g, "-")
    .replace(/\.\.+/g, ".")
    .slice(0, 120);
  if (!nome) return ctx.reply.status(400).send({ error: "Dê um nome ao material." });

  var conteudo = String(b.conteudo || "");
  if (!/^data:[^;,]*;base64,/.test(conteudo)) {
    return ctx.reply.status(400).send({ error: "Conteúdo ausente ou em formato inesperado (esperado data URI em base64)." });
  }
  // Tipo e bytes saem do PRÓPRIO data URI: o que a tela declara não vale.
  var cabeca = conteudo.slice(0, conteudo.indexOf(",") + 1);
  var tipo = (/^data:([^;,]+)/.exec(cabeca) || [])[1] || "application/octet-stream";
  if (TIPOS.indexOf(tipo) < 0) {
    return ctx.reply.status(400).send({ error: "Tipo de arquivo não aceito: " + tipo });
  }
  var base64 = conteudo.slice(cabeca.length);
  if (!base64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) {
    return ctx.reply.status(400).send({ error: "O conteúdo não é base64 válido." });
  }
  var padding = base64.slice(-2) === "==" ? 2 : (base64.slice(-1) === "=" ? 1 : 0);
  var bytes = Math.floor((base64.length * 3) / 4) - padding;
  if (bytes > MAX_BYTES) {
    return ctx.reply.status(400).send({
      error: "Material acima do limite de 10 MB (este tem " + (Math.round(bytes / 104857.6) / 10) + " MB).",
    });
  }

  var agora = _agora();
  var id = _id("mat");
  try {
    await A.create({
      id: id, nome: nome, tipo: tipo, tamanho: bytes, dono_id: String(eu.id || ""),
      // O que isola: `escopo` diz que este arquivo é material de projeto, e a
      // tela de Arquivos recusa os que têm esse escopo. `pasta` fica vazia de
      // propósito — pasta é a organização do acervo, e material de projeto não
      // entra no acervo.
      escopo: ESCOPO_MATERIAL,
      projeto_id: projetoId,
      pasta: "",
      ativo: "sim",
      // Sem ACL própria: quem alcança o material é quem alcança o PROJETO, e
      // isso é conferido nas rotas daqui. Gravar ACL seria uma segunda régua
      // para a mesma pergunta.
      acl_nivel: "",
      acl_grant: "",
      criado_em: agora, created_at: agora,
    });
  } catch (e) {
    return ctx.reply.status(500).send({ error: "Não deu para guardar o material" });
  }
  try {
    await C.create({ id: id, arquivo_id: id, conteudo: conteudo, created_at: agora });
  } catch (e) {
    // Metadado sem conteúdo aparece na lista e não baixa. Melhor apagar o
    // metadado do que deixar a sombra; se nem isso der, fica registrado.
    try { if (A.delete) await A.delete(id); } catch (e2) {
      try { await _log(ctx, eu, "material_orfao", projetoId, "", { id: id, nome: nome }); } catch (e3) {}
    }
    return ctx.reply.status(500).send({ error: "Não deu para guardar o conteúdo do material" });
  }
  await _log(ctx, eu, "material_enviado", projetoId, "", { id: id, nome: nome, tamanho: bytes });
  return ctx.reply.status(201).send({
    success: true,
    data: { id: id, nome: nome, tipo: tipo, tamanho: bytes, dono_id: String(eu.id || ""), criado_em: agora },
  });
}
module.exports = { handler };
