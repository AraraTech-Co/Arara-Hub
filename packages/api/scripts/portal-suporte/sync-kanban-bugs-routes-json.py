#!/usr/bin/env python3
"""Aplica patches Kanban (plan bugs) em data/exports/portal-suporte/routes.json e regen TS."""
import json
import os
import re
import subprocess
import sys

API_ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), "../.."))
REPO_ROOT = os.path.normpath(os.path.join(API_ROOT, "../.."))
ROUTES_JSON = os.path.join(API_ROOT, "data/exports/portal-suporte/routes.json")
PS_SCRIPTS = os.path.join(REPO_ROOT, "apps/portal-suporte/scripts")


def routes_by_key(routes):
    return {(r["method"].upper(), r["path"]): r for r in routes}


def load_copia():
    raw = open(os.path.join(PS_SCRIPTS, "wa-midia-bytes.py"), encoding="utf-8").read()
    copia = raw.split('COPIA = """\n')[1].split('""" % MARCA')[0]
    return (copia % "scripts/wa-midia-bytes.py").strip()


def load_escalada_bloco():
    raw = open(os.path.join(PS_SCRIPTS, "kanban-dev-escalada-implicita.py"), encoding="utf-8").read()
    return raw.split("BLOCO = '''\n")[1].split("\n'''")[0].strip()


def load_dev_handlers():
    import subprocess

    subprocess.run(
        [sys.executable, os.path.join(PS_SCRIPTS, "kanban-dev-regras.py"), "--dump-tmp"],
        check=True,
        cwd=os.path.dirname(PS_SCRIPTS),
    )
    return (
        open("/tmp/kdev_tickets_id_escalar-dev.js", encoding="utf-8").read(),
        open("/tmp/kdev_dev_tickets.js", encoding="utf-8").read(),
        open("/tmp/kdev_dev_tickets_id_mover.js", encoding="utf-8").read(),
    )


def _guarda_de_producao(cod):
    idx = cod.find("// ── Guarda de sessão (scripts/guarda-sessao.py)")
    return cod[idx:] if idx >= 0 else ""


def _fundir_guarda(novo, prod):
    if "_gsComSessao" in novo:
        return novo
    guard = _guarda_de_producao(prod)
    if not guard:
        return novo
    base = novo.replace("module.exports = { handler };", "").rstrip()
    return base + "\n" + guard


def patch_status_helper(cod):
    old = (
        "  if (!isResolved && wasResolved) {\n    patch.resolved_at = null;\n  }\n  var row = await Ticket.update(id, patch);"
    )
    new = (
        "  if (!isResolved && wasResolved) {\n    patch.resolved_at = null;\n  }\n"
        "  var prevAssignee = ticket.assigned_to || ticket.assignedTo || null;\n"
        "  if (isResolved && prevAssignee) {\n    patch.assigned_to = null;\n  }\n"
        "  var row = await Ticket.update(id, patch);"
    )
    if old in cod:
        cod = cod.replace(old, new, 1)
    old2 = "completed_by: isResolved ? actor : null,\n        },"
    new2 = (
        "completed_by: isResolved ? actor : null,\n"
        "          assignee_cleared: isResolved && prevAssignee ? prevAssignee : null,\n"
        "        },"
    )
    if old2 in cod:
        cod = cod.replace(old2, new2, 1)
    bloco = load_escalada_bloco()
    pat = r"  // ── Escalada implícita \(scripts/kanban-dev-escalada-implicita\.py\) ──[\s\S]*?\n  \}\n"
    if "dev_ticket_number" not in cod or "DEV-" not in cod:
        cod, _ = re.subn(pat, bloco + "\n", cod, count=1)
    return cod


def patch_assign(cod):
    old = """  try {
    const row = await model.update(id, {
      assigned_to: assignee,
      updated_at: new Date().toISOString(),
    });"""
    new = """  try {
    const ticket = await model.findById(id);
    if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
    const fromUserId = ticket.assigned_to || ticket.assignedTo || null;
    var RESOLVED = {
      resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,
      post_mortem: 1, migracao_concluida: 1, fechado: 1
    };
    var force = body.force === true || body.takeover === true;
    var st = String(ticket.status || "");
    if (assignee && fromUserId && String(fromUserId) !== String(assignee) && !force && !RESOLVED[st]) {
      return ctx.reply.status(409).send({
        error: "Chamado já atribuído a outro atendente. Use assumir com confirmação.",
        assigned_to: fromUserId,
      });
    }
    const row = await model.update(id, {
      assigned_to: assignee,
      updated_at: new Date().toISOString(),
    });"""
    if old in cod:
        cod = cod.replace(old, new)
    return cod


def patch_wa_ticket(cod):
    if "_occurredAt" not in cod:
        anchor = "  var ts = nowIso();\n  var me = userId(ctx);\n  var ticket = await m.Ticket.create({"
        insert = """  var ts = nowIso();
  var me = userId(ctx);
  var _occurredAt = ts;
  try {
    var _inb = (await m.Msg.findMany({})) || [];
    _inb.sort(function (a, b) {
      var ta = new Date(a.created_at || a.timestamp || a.createdAt || 0).getTime();
      var tb = new Date(b.created_at || b.timestamp || b.createdAt || 0).getTime();
      return ta - tb;
    });
    for (var _oi = 0; _oi < _inb.length; _oi++) {
      var _om = _inb[_oi];
      var _oc = String(_om.conversation_id || _om.conversationId || _om.whatsapp_conversation_id || "");
      if (_oc !== String(id)) continue;
      var _dir = String(_om.direction || _om.dir || "inbound").toLowerCase();
      if (_dir !== "inbound" && _dir !== "in") continue;
      var _when = _om.created_at || _om.timestamp || _om.createdAt;
      if (_when) { _occurredAt = _when; break; }
    }
  } catch (e) {}
  var ticket = await m.Ticket.create({"""
        cod = cod.replace(anchor, insert, 1)
        cod = cod.replace(
            '    status: "novos_chamados",\n    source: "whatsapp",',
            '    status: "novos_chamados",\n    occurred_at: _occurredAt,\n    source: "whatsapp",',
            1,
        )
    copia = load_copia()
    pat = r"  // ── Mídias da conversa viram ANEXOS do chamado \(scripts/wa-midia-bytes\.py\) ──[\s\S]*?  \} catch \(e\) \{\}\n"
    if re.search(pat, cod):
        cod, _ = re.subn(pat, copia + "\n", cod, count=1)
    elif "scripts/wa-midia-bytes.py" not in cod:
        alvo = "  await m.Conv.update(id, {"
        cod = cod.replace(alvo, copia + "\n  " + alvo, 1)
    return cod


BLOB_HANDLER = open(
    os.path.join(PS_SCRIPTS, "anexos-blob-rota.py"), encoding="utf-8"
).read().split('HANDLER = r"""')[1].split('"""')[0].strip()


def main():
    data = json.load(open(ROUTES_JSON, encoding="utf-8"))
    routes = data["routes"]
    by = routes_by_key(routes)
    escal, criar, mover = load_dev_handlers()

    for key in ("PATCH", "/tickets/:id/status"), ("POST", "/tickets/:id/status"):
        r = by.get(key)
        if r:
            r["controllerCode"] = patch_status_helper(r["controllerCode"])

    for key in ("PATCH", "/tickets/:id/assign"), ("POST", "/tickets/:id/assign"):
        r = by.get(key)
        if r:
            r["controllerCode"] = patch_assign(r["controllerCode"])

    r = by.get(("POST", "/whatsapp/:id/ticket"))
    if r:
        r["controllerCode"] = patch_wa_ticket(r["controllerCode"])

    for key, tpl in (
        (("POST", "/tickets/:id/escalar-dev"), escal),
        (("POST", "/dev/tickets"), criar),
        (("POST", "/dev/tickets/:id/mover"), mover),
    ):
        r = by.get(key)
        if r:
            r["controllerCode"] = _fundir_guarda(tpl, r["controllerCode"])

    if not any(r.get("path") == "/attachments/:id/blob" for r in routes):
        routes.append(
            {
                "module": "attachments",
                "method": "GET",
                "path": "/attachments/:id/blob",
                "controllerCode": BLOB_HANDLER,
                "authMode": "required",
                "webhookSecretName": None,
                "requiredPermissions": [],
                "routeId": "kanban-bugs-blob-anexo",
            }
        )

    json.dump(data, open(ROUTES_JSON, "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    print("✓", ROUTES_JSON)
    subprocess.check_call(["npm", "run", "codegen:routes"], cwd=REPO_ROOT)


if __name__ == "__main__":
    main()
