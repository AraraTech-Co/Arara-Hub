#!/usr/bin/env python3
# =============================================================================
# Telefone no cadastro + fecha o buraco de escalada de privilégio no perfil.
#
# CONTEXTO: a recuperação de senha vai ser por WhatsApp (decisão de 17/08). Para
# ser recuperação e não sequestro de conta, o código precisa ir para um número
# QUE JÁ ESTAVA no cadastro — não para o que a pessoa digita na hora. Hoje o
# `Profile` não tem telefone nenhum.
#
# Duas coisas, no mesmo lugar:
#
# 1) TELEFONE gravado no cadastro
#    - `/auth/cliente/confirmar` já recebia e CONFERIA o WhatsApp por código, e
#      jogava o número fora ao criar o perfil. Agora salva.
#    - `/auth/convite/resgatar` passa a aceitar e salvar o telefone informado
#      pelo operador no cadastro.
#
# 2) GUARDA em `PUT /profiles/:id` — um achado do caminho, e grave.
#    A rota não verificava NADA e repassava o corpo inteiro para o update:
#    qualquer credencial aceita pelo app podia mandar `{"role":"admin"}` em
#    qualquer perfil, inclusive no próprio. Escalada de privilégio em uma
#    requisição. Agora:
#      - exige sessão de pessoa;
#      - você edita o SEU perfil; editar o de outro exige admin;
#      - `role` e `feature_grants` são IGNORADOS aqui para quem não é admin —
#        mudança de papel tem rota própria (`POST /profiles/:id/role`).
#
#   python3 scripts/perfil-telefone-e-guarda.py            # simula
#   python3 scripts/perfil-telefone-e-guarda.py --aplicar
# =============================================================================

import json
import os
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/perfil-telefone-e-guarda.py"


def env():
    vals = {}
    for linha in open(os.path.join(RAIZ, ".env.local")):
        linha = linha.strip()
        if linha and not linha.startswith("#") and "=" in linha:
            k, v = linha.split("=", 1)
            vals[k.strip()] = v.strip().strip('"').strip("'")
    return vals["NEXT_PUBLIC_ARARA_API_URL"], vals["ARARA_API_KEY"]


API, KEY = env()
APP = f"{API}/v1/apps/portal-suporte/modules"

# ── 1a. cliente: salvar o telefone JÁ CONFERIDO ──────────────────────────────
CLIENTE_VELHO = """  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: "user",
    company_id: empresa.id,
    unit_id: unidade ? unidade.id : null,"""
CLIENTE_NOVO = """  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: "user",
    // O número acabou de ser CONFERIDO por código; guardá-lo é o que permite
    // a recuperação de senha por WhatsApp depois. Ver %s.
    phone: numero,
    company_id: empresa.id,
    unit_id: unidade ? unidade.id : null,""" % MARCA

# ── 1b. operador: aceitar o telefone no resgate do convite ───────────────────
CONVITE_VELHO = """  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: conv.role,"""
CONVITE_NOVO = """  // Telefone do operador. Aqui não há conferência por código — quem chega
  // até este ponto já provou identidade com o convite —, mas o número é o
  // caminho da recuperação de senha depois. Ver %s.
  var telefone = String((ctx.body || {}).phone || "").replace(/\\D/g, "");
  if (telefone && (telefone.length < 10 || telefone.length > 13)) {
    return ctx.reply.status(400).send({ success: false, error: "Informe o WhatsApp com DDD" });
  }

  await Perfil.create({
    id: quem,
    email: u.email || null,
    full_name: u.name || u.email || null,
    role: conv.role,
    phone: telefone || null,""" % MARCA

# ── 2. guarda do PUT /profiles/:id ───────────────────────────────────────────
PERFIL_VELHO = """  try {
    const row = await model.update(id, ctx.body || {});
    return ctx.reply.send(row);"""
PERFIL_NOVO = """  // ── Controle de acesso (%s) ──
  // Esta rota não verificava NADA e repassava o corpo inteiro: qualquer
  // credencial aceita pelo app podia mandar {"role":"admin"} em qualquer
  // perfil. Escalada de privilégio numa requisição.
  var _RANK = { user: 10, support: 20, developer: 30, admin: 40 };
  var _APELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
  function _canon(cru) {
    var v = String(cru || "").trim().toLowerCase();
    return _RANK[v] !== undefined ? v : (_APELIDOS[v] || "");
  }
  var _u = ctx.user || {};
  var _quem = _u.id || _u.userId || null;
  if (!_quem) {
    return ctx.reply.status(403).send({ error: "Requer sessão de usuário" });
  }
  var _meu = await model.findById(_quem).catch(function () { return null; });
  var _nivel = _RANK[_canon(_meu ? _meu.role : "")] || 0;
  var _souAdmin = _nivel >= _RANK.admin;
  if (!_souAdmin && String(_quem) !== String(id)) {
    return ctx.reply.status(403).send({ error: "Você só pode editar o seu próprio perfil" });
  }

  var _corpo = Object.assign({}, ctx.body || {});
  // Papel e permissões NÃO passam por aqui para quem não é admin. Mudança de
  // papel tem rota própria, que registra quem mudou.
  if (!_souAdmin) {
    delete _corpo.role;
    delete _corpo.feature_grants;
    delete _corpo.featureGrants;
    delete _corpo.company_id;
    delete _corpo.unit_id;
    delete _corpo.expires_at;
    delete _corpo.active;
  }
  delete _corpo.id;

  // Telefone: guarda só dígitos, para casar com o WhatsApp depois.
  if (_corpo.phone !== undefined) {
    var _tel = String(_corpo.phone || "").replace(/\\D/g, "");
    if (_tel && (_tel.length < 10 || _tel.length > 13)) {
      return ctx.reply.status(400).send({ error: "Telefone inválido — informe com DDD" });
    }
    _corpo.phone = _tel || null;
  }

  try {
    const row = await model.update(id, _corpo);
    return ctx.reply.send(row);""" % MARCA

MUDANCAS = [
    ("auth", "POST", "/auth/cliente/confirmar", CLIENTE_VELHO, CLIENTE_NOVO),
    ("auth", "POST", "/auth/convite/resgatar", CONVITE_VELHO, CONVITE_NOVO),
    ("profiles", "PUT", "/profiles/:id", PERFIL_VELHO, PERFIL_NOVO),
]


def req(url, metodo="GET", dados=None):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=240) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


def main():
    aplicar = "--aplicar" in sys.argv
    publicar = set()
    for modulo, metodo, caminho, velho, novo in MUDANCAS:
        _, d = req(f"{APP}/{modulo}/routes")
        rota = [r for r in d["routes"] if r["path"] == caminho and r["method"] == metodo]
        if not rota:
            print(f"   ! {caminho}: não existe")
            continue
        rota = rota[0]
        codigo = rota["controllerCode"]
        if MARCA in codigo:
            print(f"   = {metodo} {caminho}: já aplicado")
            continue
        if codigo.count(velho) != 1:
            print(f"   ! {metodo} {caminho}: âncora aparece {codigo.count(velho)}x")
            sys.exit(1)
        atualizado = codigo.replace(velho, novo, 1)
        open(f"/tmp/perfil_{caminho.strip('/').replace('/', '_').replace(':', '')}.js", "w").write(atualizado)
        print(f"   {'→' if aplicar else ' '} {metodo} {caminho}: +{len(atualizado) - len(codigo)} caracteres")
        if not aplicar:
            continue
        corpo = {"method": metodo, "path": caminho, "controllerCode": atualizado}
        for extra in ("authMode", "webhookSecretName"):
            if rota.get(extra):
                corpo[extra] = rota[extra]
        c, r = req(f"{APP}/{modulo}/routes", "PUT", corpo)
        if c >= 300:
            print(f"      ❌ HTTP {c} {r}")
            sys.exit(1)
        publicar.add(modulo)

    if not aplicar:
        print("\n   (simulação — use --aplicar)")
        return
    for modulo in publicar:
        c, r = req(f"{APP}/{modulo}", "PATCH", {"status": "published"})
        print(f"→ publicar {modulo}: HTTP {c} {'' if c < 300 else r}")


if __name__ == "__main__":
    main()
