#!/usr/bin/env python3
# =============================================================================
# Fecha o perímetro do portal: NADA responde sem sessão de pessoa.
#
# O que existia antes
# -------------------
# A plataforma já exige credencial válida (rota `actor` sem credencial devolve
# 401), mas credencial não é o mesmo que pessoa: a chave de API de app NÃO
# carrega `ctx.user`. E o desenho que herdamos tratava "sem pessoa" como
# "chamada de serviço", concedendo passe livre:
#
#     if (!quem) return { nivel: 99, servico: true }   // passa em tudo
#     if (quem && Profile) { ...confere nível... }     // sem quem, nem confere
#
# Varredura de 31/08/2026 nas 488 rotas publicadas:
#
#     358  sem verificação de identidade nenhuma
#      89  verificam nível, mas "sem pessoa" passa por cima
#      36  fechadas de verdade (exigem sessão)
#       4  webhook_secret — superfície pública deliberada
#
# Entre as 358 estão `POST /admin/users/:id/set-password`,
# `POST /file-explorer/execute`, `POST /admin/ssh-servers/execute`,
# `POST /admin/impersonate` e `POST /api-keys`. Efeito prático: qualquer
# credencial aceita pelo app — inclusive a de um CLIENTE — alcançava tudo isso.
#
# O que passa a valer
# -------------------
# Identidade vem do JWT (`ctx.user`) OU da sessão do portal (`x-portal-sessao`).
# Sem nenhuma das duas: 401. "Ausência de pessoa" deixa de significar confiança.
#
# Duas fases, porque o risco é diferente:
#
#   FASE 1  exige sessão em tudo (nível mínimo `user`). Não tranca ninguém
#           que já esteja logado — toda pessoa é no mínimo `user`.
#   FASE 2  sobe o nível das rotas sensíveis (admin/developer). É esta que
#           impede um cliente de chamar `/admin/users`.
#
#   python3 scripts/guarda-sessao.py                      # simula tudo
#   python3 scripts/guarda-sessao.py --fase 1             # simula só a fase 1
#   python3 scripts/guarda-sessao.py --fase 1 --aplicar   # grava e publica
#   python3 scripts/guarda-sessao.py --modulo tickets     # limita a um módulo
# =============================================================================

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.request

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MARCA = "scripts/guarda-sessao.py"


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


# ── Política ─────────────────────────────────────────────────────────────────
#
# Módulos que NÃO recebem guarda. Não é esquecimento: é a superfície de máquina
# e de porta de entrada, e trancá-la quebraria login, webhook e agendamento.
#
#   auth      login, cadastro, recuperação — é a porta; não pode exigir sessão
#   health    sonda de vida
#   uptime    sonda de vida
#   rate      avaliação do atendimento pelo cliente, por link
#   cron      disparado pelo agendador da plataforma, sem pessoa
#   webhooks  entrada de terceiro, já protegida por segredo próprio
#   external  integração servidor-a-servidor do SGC, por chave
#   api       descoberta/documentação
#
# `external` fica de fora com ressalva: hoje é a única rota de negócio que
# aceita chave sem pessoa. Vale conferir com o Leonardo se ainda é usada.
FORA = {"auth", "health", "uptime", "rate", "cron", "webhooks", "external", "api"}

# Nível mínimo por módulo na FASE 2. A referência é `config/access-control.json`,
# que já é a fonte da regra na interface — a ideia é não criar uma segunda
# verdade, e sim repetir no servidor a que já existe na tela.
NIVEL = {
    # Administração da própria plataforma e de credenciais: só admin.
    "admin_users": "admin",
    "admin_permissions": "admin",
    "admin_settings": "admin",
    "admin_audit": "admin",
    "admin_analytics": "admin",
    "admin_automation": "admin",
    "admin_impersonate": "admin",
    "admin_view_as": "admin",
    "admin_recovery_codes": "admin",
    "admin_invite_codes": "admin",
    "api_keys": "admin",
    "integrations": "admin",
    "reports": "admin",
    "admin_ai": "admin",
    "ai": "admin",
    # Acesso a máquina e a arquivo: admin. `execute` roda comando no servidor.
    "file_explorer": "admin",
    "admin_ssh_servers": "admin",
    "devops": "developer",
    # Operação de desenvolvimento.
    "tasks": "developer",
    "change_requests": "developer",
    "templates": "developer",
    "emails": "developer",
    "admin_teams": "developer",
    "admin_units": "developer",
    "admin_unit_contacts": "developer",
    "admin_sla_calendar": "developer",
    "admin_sla_contracts": "developer",
    # `whatsapp` NÃO é developer: é este módulo que alimenta o /inbox, e o
    # inbox é `support` no config/access-control.json. Marcar developer aqui
    # trancaria o atendimento fora do próprio inbox.
    "whatsapp": "support",
    "sgc": "developer",
    "admin_import_trello": "developer",
    "admin_import_trello_historico": "developer",
    "admin_trello_historico": "developer",
    "admin_backfill_ticket_numbers": "admin",
    "cache": "admin",
    # Atendimento.
    "admin_companies": "support",
    "admin_incidents": "support",
    "admin_operational_alerts": "support",
    "admin_root_cause": "support",
    "admin_feed": "support",
    "sla": "support",
    "schedules": "support",
    "kb": "support",
    "productivity": "support",
    "kpi": "user",       # o painel do cliente também lê indicador
    "invites": "support",
    # Todo mundo que está logado.
    "tickets": "user",
    "profiles": "user",
    "notifications": "user",
    "upload": "user",
    "attachments": "user",
    "search": "user",
    "filters": "user",
    "settings": "user",
    "projetos": "user",       # já tem guarda própria; aqui só o piso de sessão
    "doc-acessos": "support",   # documento de apoio é material interno
}

# Exceções por rota. Caminho exato, vence o nível do módulo.
#
# `admin_backfill_ticket_numbers` é um saco de gatos: o nome diz "backfill", mas
# o módulo carrega também os ANEXOS de chamado e a meta do quadro. Atribuir o
# nível pelo nome do módulo marcou tudo como `admin` — e anexar evidência a um
# chamado virou "Sem permissão" para a equipe inteira (02/09). Nível se decide
# pelo que a rota faz, não pelo módulo onde ela foi parar.
EXCECAO = {
    # Módulo `admin_ai`, mas a tela é de outro nível: post-mortem é `support` e
    # o validador SPED é `developer` no config/access-control.json. Marcá-los
    # como `admin` trancava quem trabalha nelas.
    ("GET", "/post-mortems"): "support",
    ("GET", "/sped-validations"): "developer",
    ("POST", "/sped-validations"): "developer",
    ("GET", "/sped-validations/:id"): "developer",
    # O oposto: rota SEM guarda interna que o piso do módulo deixou em `user`.
    # `/dev/migrar-virada` é migração de quadro e `criar-perfil-alexandre` cria
    # perfil — com `user`, qualquer pessoa logada, cliente inclusive, alcançava.
    ("POST", "/dev/migrar-virada"): "admin",
    # Leituras do quadro Dev e diagnósticos: `user` deixava dado interno à vista
    # de qualquer conta logada, cliente inclusive. Não quebrava nada — era
    # vazamento, não falha.
    ("GET", "/dev/indicadores"): "support",
    ("GET", "/dev/versoes"): "support",
    ("GET", "/diag/escalados"): "support",
    ("GET", "/diag/identidade"): "support",
    ("GET", "/diag/kanban-tempo"): "support",
    ("GET", "/diag/rede"): "support",
    # As `/diag/*` de ESCRITA são manutenção, não leitura.
    ("POST", "/diag/entregas-hefler"): "admin",
    ("POST", "/diag/kanban-tempo"): "admin",
    ("POST", "/diag/mensagens-reclassificar"): "admin",
    # NÃO subir `POST /dev/tickets`, `/dev/tickets/:id/mover` e `POST /dev/versoes`:
    # elas têm guarda PRÓPRIA que entende os grants `qa` e `code_review`
    # (scripts/kanban-dev-regras.py). O guarda genérico não conhece grant, então
    # exigir `developer` aqui barraria quem tem o grant ANTES de a regra que o
    # conhece rodar. Piso baixo na frente, regra específica atrás — de propósito.
    ("POST", "/diag/criar-perfil-alexandre"): "admin",
    ("POST", "/tickets/:id/attachments"): "user",
    ("GET", "/tickets/:id/attachments"): "user",
    ("GET", "/tickets/board-meta"): "user",
    # A tela de "meu perfil" é de todo mundo; o resto de profiles idem.
    ("POST", "/admin/users/limpar-senhas"): "admin",
    # Leitura pura de diagnóstico do WhatsApp — decisão registrada em
    # scripts/wa-diagnostico-servico.py: trancar atrapalha justamente na hora
    # em que se precisa olhar. Mas continua exigindo SESSÃO.
    ("GET", "/whatsapp/diagnostico"): "user",
    ("GET", "/whatsapp/diagnostico/webhook"): "user",
}

# Rotas que precisam continuar públicas dentro de um módulo guardado.
PUBLICAS = {
    ("POST", "/tickets/acompanhar"),     # já é webhook_secret
    ("GET", "/tickets/public"),
    ("POST", "/tickets/public"),
}


# ── O guarda ─────────────────────────────────────────────────────────────────
#
# Nomes prefixados `_gs` de propósito: 88 rotas já carregam `_RANK`,
# `_APELIDOS` e `_canonico` do scripts/tickets-permissoes.py, e este bloco é
# colado no mesmo escopo. Redeclarar funcionaria, mas duas definições do mesmo
# nome no mesmo arquivo é exatamente como uma correção futura passa despercebida.
GUARDA = '''
// ── Guarda de sessão (%(marca)s) ──
// Nada responde sem pessoa identificada. A identidade vem do JWT (`ctx.user`)
// ou da sessão do portal (`x-portal-sessao`); sem nenhuma das duas, 401.
//
// O desenho anterior tratava "sem pessoa" como chamada de serviço e liberava
// tudo. Como a chave de API de app não carrega pessoa, qualquer credencial
// aceita pelo app — inclusive a de um cliente — passava por cima do nível.
async function _gsSessao(ctx) {
  try {
    var h = (ctx.headers && (ctx.headers["x-portal-sessao"] || ctx.headers["X-Portal-Sessao"])) || "";
    var partes = String(h).split(".");
    if (partes.length !== 2 || !partes[0] || !partes[1]) return null;
    var S = ctx.models && ctx.models.Sessao;
    if (!S) return null;
    var linha = await S.findById("ses_" + partes[0]);
    if (!linha || linha.revogada === true) return null;
    if (String(linha.verificador || "") !== partes[1]) return null;
    if (linha.expira_em && new Date(linha.expira_em).getTime() < Date.now()) return null;
    return linha.user_id || null;
  } catch (e) { return null; }
}
var _gsRANK = { user: 10, support: 20, developer: 30, admin: 40 };
var _gsAPELIDOS = { master: "admin", gerente: "admin", member: "support", agent: "support", vendedor: "user" };
function _gsCanonico(cru) {
  var v = String(cru || "").trim().toLowerCase();
  return _gsRANK[v] !== undefined ? v : (_gsAPELIDOS[v] || "");
}
async function _gsEuSou(ctx) {
  var u = ctx.user || {};
  var quem = u.id || u.userId || (await _gsSessao(ctx));
  if (!quem) return null;
  var p = null;
  if (ctx.models && ctx.models.Profile) {
    p = await ctx.models.Profile.findById(quem).catch(function () { return null; });
  }
  return { id: quem, nivel: _gsRANK[_gsCanonico(p ? p.role : "")] || 0 };
}
var _gsOriginal = %(anterior)s;
async function _gsComSessao(ctx) {
  var eu = await _gsEuSou(ctx);
  if (!eu) {
    return ctx.reply.status(401).send({ success: false, error: "Requer sessão do portal" });
  }
  if (eu.nivel < _gsRANK["%(minimo)s"]) {
    return ctx.reply.status(403).send({ success: false, error: "Sem permissão para esta operação" });
  }
  return _gsOriginal(ctx);
}
module.exports = { handler: _gsComSessao };
'''


def req(url, metodo="GET", dados=None, timeout=180):
    corpo = json.dumps(dados).encode() if dados is not None else None
    cab = {"x-api-key": KEY}
    if corpo:
        cab["Content-Type"] = "application/json"
    r = urllib.request.Request(url, data=corpo, headers=cab, method=metodo)
    try:
        with urllib.request.urlopen(r, timeout=timeout) as resp:
            return resp.status, json.loads(resp.read() or b"{}")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")[:300]


EXPORTS = re.compile(r"module\.exports\s*=\s*\{\s*handler(?:\s*:\s*([A-Za-z0-9_$]+))?\s*\}\s*;?")


def injeta(codigo, minimo):
    """Envolve o handler exportado. Se já houver um invólucro (o controle de
    acesso por campo do tickets-permissoes.py), envolve ELE — a sessão passa a
    ser conferida antes, e a regra por campo continua valendo depois."""
    achados = list(EXPORTS.finditer(codigo))
    if not achados:
        return None
    ultimo = achados[-1]
    anterior = ultimo.group(1) or "handler"
    bloco = GUARDA % {"marca": MARCA, "anterior": anterior, "minimo": minimo}
    return codigo[: ultimo.start()] + bloco + codigo[ultimo.end():]


NIVEIS_JS = ('user', 'support', 'developer', 'admin')


def reescreve_nivel(codigo, minimo):
    """Troca o nível exigido numa rota que JÁ tem a guarda. Devolve None quando
    o código já está no nível pedido — assim `--nivel` continua idempotente."""
    alvo = f'_gsRANK["{minimo}"]'
    for n in NIVEIS_JS:
        atual = f'_gsRANK["{n}"]'
        if atual in codigo:
            return None if n == minimo else codigo.replace(atual, alvo)
    return None


def nivel_de(mod, metodo, caminho, fase):
    if fase == 1:
        return "user"
    return EXCECAO.get((metodo, caminho)) or NIVEL.get(mod, "developer")


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--fase", type=int, choices=(1, 2), default=2)
    p.add_argument("--modulo", action="append", default=None)
    p.add_argument(
        "--rota",
        action="append",
        default=None,
        metavar="METODO:/caminho",
        help="limita a ação a rotas específicas. Sem isto, `--nivel` reescreve o "
             "módulo inteiro — e módulo não é unidade de permissão: um mesmo "
             "módulo pode ter rota de administrador e rota de todo mundo.",
    )
    p.add_argument("--aplicar", action="store_true")
    p.add_argument(
        "--nivel",
        choices=("user", "support", "developer", "admin"),
        help="força este nível nos módulos indicados, REESCREVENDO a guarda que já "
             "estiver lá. É o caminho para ajustar um nível errado sem ter de "
             "remover e reinjetar — e para isolar, em diagnóstico, se a tela quebra "
             "por identidade (401) ou por papel (403).",
    )
    a = p.parse_args()

    c, d = req(f"{APP}/modules")
    if c >= 300:
        print(f"❌ não consegui listar módulos: HTTP {c} {d}")
        sys.exit(1)
    mods = [m["name"] for m in d["modules"]]
    if a.modulo:
        mods = [m for m in mods if m in a.modulo]

    print(f"→ fase {a.fase} · {'APLICANDO' if a.aplicar else 'simulação'}\n")
    total = pulados = 0
    for mod in mods:
        if mod in FORA:
            print(f"   ⊘ {mod}: fora da política (superfície de máquina/pública)")
            continue
        c, dd = req(f"{APP}/modules/{mod}/routes")
        if c >= 300:
            print(f"   ❌ {mod}: HTTP {c}")
            continue
        mudadas = 0
        for r in dd.get("routes", []):
            metodo, caminho = r.get("method"), r.get("path")
            codigo = r.get("controllerCode") or ""
            if (metodo, caminho) in PUBLICAS or r.get("authMode") == "webhook_secret":
                continue
            if a.rota and f"{metodo}:{caminho}" not in a.rota:
                continue
            if MARCA in codigo:
                if not a.nivel:
                    pulados += 1
                    continue
                minimo = a.nivel
                novo = reescreve_nivel(codigo, minimo)
                if novo is None:
                    pulados += 1
                    continue
            else:
                minimo = a.nivel or nivel_de(mod, metodo, caminho, a.fase)
                novo = injeta(codigo, minimo)
            if novo is None:
                print(f"   ! {mod:26} {metodo:6} {caminho}: sem module.exports reconhecível, pulando")
                continue
            print(f"   {'→' if a.aplicar else ' '} {mod:26} {metodo:6} {caminho:46} {minimo}+")
            total += 1
            if not a.aplicar:
                continue
            corpo = {"method": metodo, "path": caminho, "controllerCode": novo}
            for extra in ("authMode", "webhookSecretName"):
                if r.get(extra):
                    corpo[extra] = r[extra]
            cc, resp = req(f"{APP}/modules/{mod}/routes", "PUT", corpo)
            if cc >= 300:
                print(f"      ❌ HTTP {cc} {resp}")
                sys.exit(1)
            mudadas += 1
        if a.aplicar and mudadas:
            # Publicar promove o rascunho INTEIRO do módulo — por isso a
            # publicação é por módulo, logo depois de mexer nele.
            cc, resp = req(f"{APP}/modules/{mod}", "PATCH", {"status": "published"})
            print(f"   ✓ publicar {mod}: HTTP {cc} {'' if cc < 300 else resp}")

    print(f"\n   {total} rota(s) a guardar · {pulados} já com guarda")
    if not a.aplicar:
        print("   (simulação — use --aplicar)")


if __name__ == "__main__":
    main()
