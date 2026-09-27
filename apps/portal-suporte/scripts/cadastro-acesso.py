#!/usr/bin/env python3
# =============================================================================
# Instala as duas portas de cadastro do portal.
#
# REGRA: criar conta na plataforma não dá acesso ao portal. Quem concede acesso
# é o `Profile` — sem ele a pessoa até existe, mas não tem papel e não entra.
# As duas portas abaixo são os únicos caminhos que criam um `Profile`.
#
#   OPERADOR  código de 6 caracteres emitido por um admin. O código carrega o
#             papel (support/developer/admin), tem validade e morre no uso.
#
#   CLIENTE   a pessoa informa o WhatsApp dela no cadastro e recebe ali o
#             código de 6 dígitos. É o único canal de saída que a sandbox
#             permite hoje: não há SMTP no cofre e a allowlist só tem o
#             provedor de WhatsApp — por isso não é e-mail.
#
# O que impede este endpoint de virar disparador de spam pago pela Arara NÃO é
# exigir número previamente cadastrado — isso trancaria o celular pessoal de
# quase todo funcionário de loja. É exigir SESSÃO: só quem já criou a conta e
# está logado pede o código, um número por conta, com espera entre tentativas e
# um teto por hora. Anônimo não dispara mensagem nenhuma.
#
# A empresa vem do CNPJ que a pessoa informa no cadastro — não do telefone.
# Casar por telefone vincularia uma pessoa por loja e deixaria as demais fora.
# CNPJ de filial também casa, e aí a conta nasce já na unidade certa.
#
#   python3 scripts/cadastro-acesso.py            # simula
#   python3 scripts/cadastro-acesso.py --aplicar  # grava e publica
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte"

# ── Trechos compartilhados ───────────────────────────────────────────────────

COMUM = r"""
var RANK = { user: 10, support: 20, developer: 30, admin: 40 };
var APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function canonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return RANK[v] !== undefined ? v : (APELIDOS[v] || "");
}
async function exigirNivel(ctx, minimo) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  // Aqui a chave de serviço NÃO passa: emitir convite e conceder papel são
  // atos de uma pessoa, e precisam ficar no nome de alguém.
  if (!quem) return { erro: [403, "Requer sessão de usuário"] };
  var perfil = ctx.models.Profile ? await ctx.models.Profile.findById(quem) : null;
  if ((RANK[canonico(perfil ? perfil.role : "")] || 0) < RANK[minimo]) {
    return { erro: [403, "Sem permissão"] };
  }
  return { quem: quem, perfil: perfil };
}
function so(digitos) {
  return String(digitos || "").replace(/\D/g, "");
}
/** CNPJ só com dígitos. O cadastro tem as duas grafias: "30.589.594/0001-89"
    e "50859985000183". Comparar texto cru não casaria uma com a outra. */
function soCnpj(v) {
  return String(v || "").replace(/\D/g, "");
}
/** Dígitos verificadores — pega erro de digitação antes de dizer
    "não encontrado", que mandaria a pessoa procurar problema onde não há. */
function cnpjValido(c) {
  if (c.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  var calc = function (base, pesos) {
    var soma = 0;
    for (var i = 0; i < pesos.length; i++) soma += Number(base[i]) * pesos[i];
    var r = soma % 11;
    return r < 2 ? 0 : 11 - r;
  };
  var d1 = calc(c, [5,4,3,2,9,8,7,6,5,4,3,2]);
  var d2 = calc(c, [6,5,4,3,2,9,8,7,6,5,4,3,2]);
  return Number(c[12]) === d1 && Number(c[13]) === d2;
}
/** Compara telefone ignorando DDI, nono dígito e formatação. */
function mesmoNumero(a, b) {
  var x = so(a), y = so(b);
  if (!x || !y) return false;
  x = x.slice(-8); y = y.slice(-8);
  return x.length === 8 && x === y;
}
"""

# ── A. Emitir convite (admin) ────────────────────────────────────────────────

EMITIR = COMUM + r"""
// Sem 0/O e 1/I: alguém vai ditar este código por telefone e digitá-lo à mão.
var ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function gerarCodigo() {
  var n = 6, saida = "";
  var buf = null;
  try {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      buf = new Uint32Array(n);
      globalThis.crypto.getRandomValues(buf);
    }
  } catch (e) { buf = null; }
  for (var i = 0; i < n; i++) {
    // Sorteio criptográfico quando existe; Math.random é o último recurso e
    // fica registrado como tal — para um código de uso único, com validade
    // curta e revogável, o risco é aceitável, mas não é o desejável.
    var r = buf ? buf[i] : Math.floor(Math.random() * 4294967296);
    saida += ALFABETO[r % ALFABETO.length];
  }
  return saida;
}

async function handler(ctx) {
  var g = await exigirNivel(ctx, "admin");
  if (g.erro) return ctx.reply.status(g.erro[0]).send({ success: false, error: g.erro[1] });

  var Code = ctx.models.InviteCode;
  if (!Code) return ctx.reply.status(500).send({ error: "Model InviteCode missing" });

  var body = ctx.body || {};
  var papel = canonico(body.role);
  // Convite não cria cliente: o caminho do cliente é a confirmação por
  // WhatsApp, que amarra o número a uma empresa.
  if (papel !== "support" && papel !== "developer" && papel !== "admin") {
    return ctx.reply.status(400).send({ success: false, error: "Papel inválido. Use support, developer ou admin." });
  }
  var dias = Number(body.expiresInDays || body.dias || 7);
  if (!(dias > 0 && dias <= 30)) dias = 7;

  // Colisão é improvável (32^6), mas o custo de conferir é uma consulta.
  var codigo = null;
  for (var tentativa = 0; tentativa < 5 && !codigo; tentativa++) {
    var c = gerarCodigo();
    var existe = (await Code.findMany({ code: c })) || [];
    if (!existe.length) codigo = c;
  }
  if (!codigo) return ctx.reply.status(500).send({ success: false, error: "Não foi possível gerar um código" });

  var agora = new Date();
  var venc = new Date(agora.getTime() + dias * 86400000);
  var row = await Code.create({
    code: codigo,
    role: papel,
    label: String(body.label || "").slice(0, 120) || null,
    created_by: g.quem,
    created_at: agora.toISOString(),
    expires_at: venc.toISOString(),
    used_at: null,
    used_by_id: null,
  });

  // O código volta AGORA e só agora — a listagem não o repete.
  return ctx.reply.status(201).send({
    success: true,
    data: { id: row.id, code: codigo, role: papel, label: row.label, expires_at: row.expires_at },
  });
}
module.exports = { handler };
"""

# ── B. Listar convites (admin) ───────────────────────────────────────────────

LISTAR = COMUM + r"""
async function handler(ctx) {
  var g = await exigirNivel(ctx, "admin");
  if (g.erro) return ctx.reply.status(g.erro[0]).send({ success: false, error: g.erro[1] });

  var Code = ctx.models.InviteCode;
  if (!Code) return ctx.reply.status(500).send({ error: "Model InviteCode missing" });

  var rows = (await Code.findMany({})) || [];
  var porId = {};
  try {
    var perfis = (await ctx.models.Profile.findMany({})) || [];
    for (var i = 0; i < perfis.length; i++) {
      porId[String(perfis[i].id)] = perfis[i].full_name || perfis[i].email || null;
    }
  } catch (e) {}

  var agora = Date.now();
  var data = rows.map(function (r) {
    var venceu = r.expires_at ? new Date(r.expires_at).getTime() < agora : false;
    return {
      id: r.id,
      // Devolve o código inteiro. A primeira versão mostrava só os dois
      // últimos caracteres, por prudência — mas a tela existe justamente para
      // emitir e PASSAR o código a alguém, e sem poder copiá-lo depois quem
      // emite tem de reemitir a cada vez que fecha a janela. O risco é
      // contido: uso único, validade curta, revogável, e a rota exige admin.
      code: String(r.code || ""),
      role: r.role,
      label: r.label || null,
      status: r.used_at ? "usado" : venceu ? "expirado" : "ativo",
      created_at: r.created_at,
      expires_at: r.expires_at,
      used_at: r.used_at || null,
      criado_por: porId[String(r.created_by)] || null,
      usado_por: r.used_by_id ? (porId[String(r.used_by_id)] || null) : null,
    };
  });
  data.sort(function (a, b) { return String(b.created_at).localeCompare(String(a.created_at)); });
  return ctx.reply.send({ success: true, data: data, count: data.length });
}
module.exports = { handler };
"""

# ── C. Revogar convite (admin) ───────────────────────────────────────────────

REVOGAR = COMUM + r"""
async function handler(ctx) {
  var g = await exigirNivel(ctx, "admin");
  if (g.erro) return ctx.reply.status(g.erro[0]).send({ success: false, error: g.erro[1] });

  var Code = ctx.models.InviteCode;
  var id = ctx.params.id;
  if (!id) return ctx.reply.status(400).send({ success: false, error: "Informe o id" });
  var atual = await Code.findById(id);
  if (!atual) return ctx.reply.status(404).send({ success: false, error: "Convite não encontrado" });
  // Convite já usado não se apaga: ele é o registro de como aquela pessoa
  // ganhou acesso.
  if (atual.used_at) {
    return ctx.reply.status(409).send({ success: false, error: "Convite já utilizado; o registro é mantido" });
  }
  await Code.delete(id);
  return ctx.reply.send({ success: true });
}
module.exports = { handler };
"""

# ── D. Operador resgata o convite ────────────────────────────────────────────

RESGATAR = COMUM + r"""
async function handler(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  // Exige JWT: o papel é concedido a QUEM está logado, e não a um id que o
  // cliente mandaria no corpo.
  if (!quem) return ctx.reply.status(403).send({ success: false, error: "Entre na sua conta para resgatar o convite" });

  var Code = ctx.models.InviteCode;
  var Perfil = ctx.models.Profile;
  if (!Code || !Perfil) return ctx.reply.status(500).send({ error: "Model ausente" });

  var jaTem = await Perfil.findById(quem);
  if (jaTem && jaTem.role) {
    return ctx.reply.status(409).send({ success: false, error: "Esta conta já tem acesso ao portal" });
  }

  var codigo = String((ctx.body || {}).code || "").trim().toUpperCase();
  if (codigo.length !== 6) {
    return ctx.reply.status(400).send({ success: false, error: "O código tem 6 caracteres" });
  }

  var achados = (await Code.findMany({ code: codigo })) || [];
  var conv = achados.filter(function (c) { return String(c.code).toUpperCase() === codigo; })[0];
  // Mensagem única para inexistente, usado e expirado: distinguir os três
  // ensinaria um atacante a separar código válido de inválido.
  var recusa = { success: false, error: "Código inválido, já utilizado ou expirado" };
  if (!conv) return ctx.reply.status(400).send(recusa);
  if (conv.used_at) return ctx.reply.status(400).send(recusa);
  if (conv.expires_at && new Date(conv.expires_at).getTime() < Date.now()) {
    return ctx.reply.status(400).send(recusa);
  }

  var agora = new Date().toISOString();
  // Marca o convite ANTES de criar o perfil: se algo falhar no meio, sobra um
  // convite queimado (recuperável emitindo outro) em vez de um convite vivo
  // que dois pedidos simultâneos poderiam gastar duas vezes.
  await Code.update(conv.id, { used_at: agora, used_by_id: quem });

  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: conv.role,
    created_at: agora,
    updated_at: agora,
  });

  return ctx.reply.status(201).send({ success: true, data: { role: conv.role } });
}
module.exports = { handler };
"""

# ── E. Cliente pede código por WhatsApp ──────────────────────────────────────

PEDIR_CODIGO = COMUM + r"""
async function handler(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  // Exige sessão. É esta linha que impede o endpoint de virar disparador de
  // WhatsApp para qualquer número do Brasil, pago pela Arara — e não exigir
  // número previamente cadastrado, que trancaria o celular pessoal de quase
  // todo funcionário de loja.
  if (!quem) {
    return ctx.reply.status(403).send({ success: false, error: "Crie sua conta antes de confirmar o WhatsApp" });
  }

  var Tok = ctx.models.VerificationToken;
  var Perfil = ctx.models.Profile;
  if (!Tok) return ctx.reply.status(500).send({ error: "Model VerificationToken missing" });

  var jaTem = await Perfil.findById(quem);
  if (jaTem && jaTem.role) {
    return ctx.reply.status(409).send({ success: false, error: "Esta conta já tem acesso ao portal" });
  }

  var numero = so((ctx.body || {}).phone);
  if (numero.length < 10 || numero.length > 13) {
    return ctx.reply.status(400).send({ success: false, error: "Informe o WhatsApp com DDD" });
  }

  var agora = Date.now();
  var todos = (await Tok.findMany({})) || [];

  // Teto por hora, para o dia em que algo der errado em laço. Sem isto, um
  // defeito nosso viraria conta de mensagem.
  var naUltimaHora = 0;
  for (var t = 0; t < todos.length; t++) {
    var criadoEm = new Date(todos[t].expires).getTime() - 600000;
    if (String(todos[t].identifier || "").indexOf("wa:") === 0 && agora - criadoEm < 3600000) naUltimaHora++;
  }
  if (naUltimaHora >= 60) {
    return ctx.reply.status(429).send({ success: false, error: "Muitos envios agora. Tente em alguns minutos." });
  }

  // Um pedido por minuto, por conta. A chave é a CONTA, não o número: trocar
  // de número não zera a espera.
  var meus = todos.filter(function (x) { return String(x.identifier || "") === "wa:" + quem; });
  for (var k = 0; k < meus.length; k++) {
    var criado = new Date(meus[k].expires).getTime() - 600000;
    if (agora - criado < 60000) {
      return ctx.reply.status(429).send({ success: false, error: "Aguarde um minuto para pedir outro código" });
    }
    try { await Tok.delete(meus[k].token); } catch (e) {}
  }

  var codigo = "";
  try {
    if (globalThis.crypto && globalThis.crypto.getRandomValues) {
      var buf = new Uint32Array(6);
      globalThis.crypto.getRandomValues(buf);
      for (var e2 = 0; e2 < 6; e2++) codigo += String(buf[e2] % 10);
    }
  } catch (e) { codigo = ""; }
  if (codigo.length !== 6) {
    codigo = "";
    for (var d = 0; d < 6; d++) codigo += String(Math.floor(Math.random() * 10));
  }

  // Guardado sob a CONTA: assim o código só serve para quem o pediu, mesmo
  // que outra pessoa descubra o número.
  await Tok.create({
    identifier: "wa:" + quem,
    token: codigo + ":" + numero + ":" + quem,
    expires: new Date(agora + 600000).toISOString(),
  });

  var token = await ctx.secrets.get("whatsapp_token");
  if (!token) return ctx.reply.status(503).send({ success: false, error: "Canal de WhatsApp indisponível" });
  var destino = numero.length <= 11 ? "55" + numero : numero;
  var r = await ctx.fetch("https://www.avisaapi.com.br/api/actions/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
    body: JSON.stringify({
      number: destino,
      message: "Arara Tech - seu codigo de acesso ao portal de suporte e " + codigo +
               ". Vale por 10 minutos. Se nao foi voce que pediu, ignore esta mensagem.",
    }),
  });
  if (!r || r.status >= 300) {
    return ctx.reply.status(502).send({ success: false, error: "Não foi possível enviar o código agora" });
  }

  return ctx.reply.send({ success: true, data: { enviado: true, para_final: numero.slice(-4) } });
}
module.exports = { handler };
"""

# ── F. Cliente confirma o código ─────────────────────────────────────────────

CONFIRMAR = COMUM + r"""
async function handler(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || null;
  if (!quem) return ctx.reply.status(403).send({ success: false, error: "Entre na sua conta para confirmar" });

  var Tok = ctx.models.VerificationToken;
  var Perfil = ctx.models.Profile;

  var jaTem = await Perfil.findById(quem);
  if (jaTem && jaTem.role) {
    return ctx.reply.status(409).send({ success: false, error: "Esta conta já tem acesso ao portal" });
  }

  var numero = so((ctx.body || {}).phone);
  var codigo = String((ctx.body || {}).code || "").trim();
  if (numero.length < 10 || codigo.length !== 6) {
    return ctx.reply.status(400).send({ success: false, error: "Informe o número e o código de 6 dígitos" });
  }

  var linhas = (await Tok.findMany({ identifier: "wa:" + quem })) || [];
  var valida = null;
  for (var i = 0; i < linhas.length; i++) {
    var partes = String(linhas[i].token || "").split(":");
    // Confere o código E o número: o par tem que ser o mesmo que foi enviado.
    if (partes[0] === codigo && so(partes[1]) === numero && new Date(linhas[i].expires).getTime() > Date.now()) {
      valida = linhas[i];
    }
  }
  if (!valida) {
    return ctx.reply.status(400).send({ success: false, error: "Código inválido ou expirado" });
  }
  // Queima o código no primeiro uso, certo ou errado que venha depois.
  try { await Tok.delete(valida.token); } catch (e) {}

  // A empresa vem do CNPJ que a pessoa informa, não do telefone dela. Cada
  // loja tem várias pessoas usando o suporte, e o celular de cada uma não é o
  // número cadastrado da empresa — casar por telefone vincularia uma só e
  // deixaria as outras de fora. O WhatsApp confirma a PESSOA; o CNPJ diz de
  // qual empresa ela é.
  var cnpj = soCnpj((ctx.body || {}).cnpj);
  if (!cnpj) {
    return ctx.reply.status(400).send({ success: false, error: "Informe o CNPJ da sua empresa" });
  }
  if (!cnpjValido(cnpj)) {
    return ctx.reply.status(400).send({ success: false, error: "CNPJ inválido. Confira os números." });
  }

  var empresa = null, unidade = null;
  try {
    var emps = (await ctx.models.Company.findMany({})) || [];
    for (var j = 0; j < emps.length && !empresa; j++) {
      // `synced_from_tickets` é resíduo de carga, não cadastro.
      if (!emps[j].synced_from_tickets && soCnpj(emps[j].cnpj) === cnpj) empresa = emps[j];
    }
  } catch (e) {}
  // Filial tem CNPJ próprio: casando por ela, a conta nasce já na unidade certa.
  if (!empresa) {
    try {
      var uns = (await ctx.models.Unit.findMany({})) || [];
      for (var k2 = 0; k2 < uns.length && !empresa; k2++) {
        if (soCnpj(uns[k2].cnpj) === cnpj) {
          unidade = uns[k2];
          empresa = await ctx.models.Company.findById(uns[k2].company_id);
        }
      }
    } catch (e) {}
  }
  if (!empresa) {
    // Recusa explícita, e não conta sem empresa: cliente solto no portal não
    // tem chamado que faça sentido, e "cadastrei mas não vejo nada" vira
    // chamado de suporte.
    return ctx.reply.status(404).send({
      success: false,
      error: "CNPJ não encontrado no cadastro. Fale com o suporte da Arara para liberar o acesso da sua empresa.",
    });
  }

  var agora = new Date().toISOString();
  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: "user",
    company_id: empresa.id,
    unit_id: unidade ? unidade.id : null,
    created_at: agora,
    updated_at: agora,
  });

  return ctx.reply.status(201).send({
    success: true,
    data: { role: "user", company: empresa.name, unit: unidade ? unidade.name : null },
  });
}
module.exports = { handler };
"""

ROTAS = [
    ("admin_invite_codes", "POST", "/admin/invite-codes", EMITIR),
    ("admin_invite_codes", "GET", "/admin/invite-codes", LISTAR),
    ("admin_invite_codes", "DELETE", "/admin/invite-codes/:id", REVOGAR),
    ("auth", "POST", "/auth/convite/resgatar", RESGATAR),
    ("auth", "POST", "/auth/cliente/codigo", PEDIR_CODIGO),
    ("auth", "POST", "/auth/cliente/confirmar", CONFIRMAR),
]


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=150) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    modulos = []
    for mod, metodo, caminho, codigo in ROTAS:
        if mod not in modulos:
            modulos.append(mod)
        print(f"{'→' if aplicar else ' '} {metodo:6} {caminho}  ({len(codigo)} car.)")
        if not aplicar:
            continue
        # Preserva authMode de rotas existentes; um PUT sem ele o apagaria.
        _, atual = req(f"{APP}/modules/{mod}/routes")
        antiga = next(
            (r for r in atual.get("routes", []) if r["method"] == metodo and r["path"] == caminho),
            None,
        )
        corpo = {"method": metodo, "path": caminho, "controllerCode": codigo}
        for extra in ("authMode", "webhookSecretName"):
            if antiga and antiga.get(extra):
                corpo[extra] = antiga[extra]
        c, r = req(f"{APP}/modules/{mod}/routes", "PUT", corpo)
        print(f"   HTTP {c} {'' if c < 300 else r}")
        if c >= 300:
            sys.exit(1)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return

    # Publicar promove o rascunho INTEIRO do módulo; ver o cabeçalho de
    # scripts/kanban-enriquecer.py, que existe por causa dessa armadilha.
    for mod in modulos:
        c, r = req(f"{APP}/modules/{mod}", "PATCH", {"status": "published"})
        print(f"→ publicar {mod}: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
