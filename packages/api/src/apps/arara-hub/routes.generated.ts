/** @generated from data/exports/arara-hub/routes.json — run: npm run codegen:routes */
import type { StaticRoute } from '../../lib/handler-ctx.js'
import { compileController } from '../../lib/compile-controller.js'

export const AraraHubRoutes: StaticRoute[] = [
  // 0 sonda GET /sonda/ctx (5bf7f8c9)
  {
    module: "sonda",
    method: "GET",
    path: "/sonda/ctx",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmtdb1aq5000fku014br8flib",
    handler: compileController("// Sonda de diagnóstico REMOVIDA em 28/08. O módulo permanece porque a\n// plataforma não expõe rota para apagar módulo — o conteúdo foi esvaziado e o\n// módulo despublicado.\nasync function handler(ctx) {\n  return ctx.reply.status(410).send({ error: \"removida\" });\n}\nmodule.exports = { handler };\n"),
  },
  // 1 sso POST /sso/criar (0a1fbbc4)
  {
    module: "sso",
    method: "POST",
    path: "/sso/criar",
    authMode: "actor",
    webhookSecretName: null,
    requiredPermissions: [],
    source: "cmtd3cwej0189qd01ndau9p9z",
    handler: compileController("// scripts/sso-regras.py — POST /sso/criar\n// Guarda o código de handoff. Exige JWT: é ele que prova quem está pedindo, e\n// é ele que será entregue ao app de destino.\n\nasync function handler(ctx) {\n  var C = ctx.models.CodigoSso;\n  if (!C) return ctx.reply.status(500).send({ error: \"Model CodigoSso missing\" });\n\n  // O JWT sai do CABEÇALHO, não do corpo. Ele já viaja ali; repeti-lo no corpo\n  // seria uma segunda cópia do token em rede e em log.\n  var cru = (ctx.headers && (ctx.headers.authorization || ctx.headers.Authorization)) || \"\";\n  var jwt = String(cru).replace(/^Bearer\\s+/i, \"\").trim();\n  var u = ctx.user || {};\n  var quem = u.id || u.userId || null;\n  if (!jwt || !quem) {\n    // Chave de app não serve: ela não carrega pessoa, e o handoff é sobre\n    // entregar a sessão DE ALGUÉM.\n    return ctx.reply.status(401).send({ error: \"Handoff exige login\" });\n  }\n\n  var b = ctx.body || {};\n  var id = String(b.id || \"\").trim();\n  var verificador = String(b.verificador || \"\").trim();\n  var destino = String(b.app_slug || \"\").trim();\n  // 16 e 48 hex: o código nasce de 256 bits sorteados no navegador.\n  if (!/^[a-f0-9]{16}$/.test(id) || !/^[a-f0-9]{48}$/.test(verificador)) {\n    return ctx.reply.status(400).send({ error: \"Código malformado\" });\n  }\n  if (!destino) return ctx.reply.status(400).send({ error: \"Informe o app de destino\" });\n\n  var agora = Date.now();\n  await C.create({\n    id: \"sso_\" + id,\n    verificador: verificador,\n    user_id: String(quem),\n    app_slug: destino,\n    jwt: jwt,\n    // Trinta segundos: é o tempo de um redirecionamento, não o de uma sessão.\n    expira_em: new Date(agora + 30 * 1000).toISOString(),\n    criado_em: new Date(agora).toISOString(),\n    usado_em: \"\",\n  });\n  return ctx.reply.status(201).send({ success: true });\n}\nmodule.exports = { handler };\n"),
  },
  // 2 sso POST /sso/trocar (b9194086)
  {
    module: "sso",
    method: "POST",
    path: "/sso/trocar",
    authMode: "webhook_secret",
    webhookSecretName: "hub_publico_token",
    requiredPermissions: [],
    source: "cmtd3cwuc018bqd014dpt8y24",
    handler: compileController("// scripts/sso-regras.py — POST /sso/trocar  (pública)\n// Troca o código pelo token. UMA vez: o registro é apagado na leitura.\n\nasync function handler(ctx) {\n  var C = ctx.models.CodigoSso;\n  if (!C) return ctx.reply.status(500).send({ error: \"Model CodigoSso missing\" });\n\n  // Mensagem ÚNICA para todos os motivos de recusa. Dizer qual falhou —\n  // \"expirado\" vs \"não existe\" vs \"já usado\" — entrega informação a quem está\n  // tentando adivinhar.\n  var recusa = { error: \"Este link de entrada não vale mais. Volte ao Hub e clique de novo.\" };\n\n  var partes = String((ctx.body || {}).codigo || \"\").split(\".\");\n  if (partes.length !== 2 || !partes[0] || !partes[1]) {\n    return ctx.reply.status(400).send(recusa);\n  }\n\n  var linha = await C.findById(\"sso_\" + partes[0]).catch(function () { return null; });\n  if (!linha) return ctx.reply.status(400).send(recusa);\n  if (linha.usado_em) return ctx.reply.status(400).send(recusa);\n  if (String(linha.verificador || \"\") !== partes[1]) return ctx.reply.status(400).send(recusa);\n  if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) {\n    try { await C.delete(linha.id); } catch (e) {}\n    return ctx.reply.status(400).send(recusa);\n  }\n\n  var token = linha.jwt;\n  var destino = linha.app_slug;\n  // Apagar ANTES de responder: se a resposta se perder no caminho, o código já\n  // morreu. Um handoff perdido custa um clique; um código reutilizável custa\n  // muito mais.\n  try { await C.delete(linha.id); } catch (e) {}\n\n  // Faxina oportunista dos expirados. Sem isto a tabela cresce para sempre —\n  // e ninguém cria rotina de limpeza para uma tabela que \"só tem 30 segundos\".\n  try {\n    var todos = (await C.findMany({})) || [];\n    var agora = Date.now();\n    var apagados = 0;\n    for (var i = 0; i < todos.length && apagados < 50; i++) {\n      var t = todos[i];\n      if (t.expira_em && new Date(t.expira_em).getTime() < agora) {\n        await C.delete(t.id);\n        apagados++;\n      }\n    }\n  } catch (e) {}\n\n  return ctx.reply.send({ success: true, token: token, app_slug: destino });\n}\nmodule.exports = { handler };\n"),
  }
]
