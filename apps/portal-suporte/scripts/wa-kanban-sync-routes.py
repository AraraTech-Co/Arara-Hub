#!/usr/bin/env python3
# Sincroniza patches de WA ticket (occurred_at + mídias) em routes.generated.ts
#   python3 scripts/wa-kanban-sync-routes.py --sync-routes
# =============================================================================

import json
import os
import re
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.normpath(
    os.path.join(RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts")
)


def get_handler(text, metodo, caminho):
    for m in re.finditer(r'method:\s*"(\w+)",\s*\n\s*path:\s*"([^"]+)"', text):
        if m.group(1) == metodo and m.group(2) == caminho:
            corte = text.index("compileController(", m.end())
            fim = corte + len("compileController(")
            while True:
                try:
                    cod, end = json.JSONDecoder().raw_decode(text, fim)
                    return cod, m, end
                except json.JSONDecodeError:
                    fim = text.index('")', fim) + 2
    return None, None, None


def put_handler(text, m, cod, end):
    corte = text.index("compileController(", m.end())
    esc = json.dumps(cod)
    return text[: corte + len("compileController(")] + esc + text[end:]


def load_copia():
    raw = open(os.path.join(RAIZ, "scripts", "wa-midia-bytes.py"), encoding="utf-8").read()
    copia = raw.split('COPIA = """\n')[1].split('""" % MARCA')[0]
    return (copia % "scripts/wa-midia-bytes.py").strip()


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
        if anchor not in cod:
            raise SystemExit("! âncora occurred_at não encontrada")
        cod = cod.replace(anchor, insert, 1)
        cod = cod.replace(
            '    status: "novos_chamados",\n    source: "whatsapp",',
            '    status: "novos_chamados",\n    occurred_at: _occurredAt,\n    source: "whatsapp",',
            1,
        )
        print("→ occurred_at no ticket WA")

    copia = load_copia()
    pat = (
        r"  // ── Mídias da conversa viram ANEXOS do chamado \(scripts/wa-midia-bytes\.py\) ──"
        r"[\s\S]*?  \} catch \(e\) \{\}\n(?=\n  await m\.Conv\.update)"
    )
    if re.search(pat, cod):
        cod2, n = re.subn(pat, copia.strip() + "\n\n", cod, count=1)
        if n:
            cod = cod2
            print("→ bloco mídias WA atualizado")
    elif "scripts/wa-midia-bytes.py" not in cod:
        alvo = "  await m.Conv.update(id, {"
        if alvo not in cod:
            raise SystemExit("! âncora cópia mídias não encontrada")
        cod = cod.replace(alvo, copia + "\n  " + alvo, 1)
        print("→ bloco mídias WA inserido")
    return cod


def patch_status_escalada(text):
    copia_path = os.path.join(RAIZ, "scripts", "kanban-dev-escalada-implicita.py")
    bloco = open(copia_path, encoding="utf-8").read().split("BLOCO = '''\n")[1].split("\n'''")[0].strip()
    cod, m, end = get_handler(text, "PATCH", "/tickets/:id/status")
    if not cod:
        print("! status PATCH não encontrado")
        return text
    pat = r"  // ── Escalada implícita \(scripts/kanban-dev-escalada-implicita\.py\) ──[\s\S]*?\n  \}\n"
    if "dev_ticket_number" in cod and "DEV-" in cod:
        print("= escalada implícita já com DEV")
        return text
    cod2, n = re.subn(pat, bloco + "\n", cod, count=1)
    if not n:
        print("! escalada implícita não substituída")
        return text
    print("→ escalada implícita DEV")
    return put_handler(text, m, cod2, end)


def main():
    if "--sync-routes" not in sys.argv:
        print("Use --sync-routes")
        sys.exit(1)
    text = open(ROUTES, encoding="utf-8").read()
    cod, m, end = get_handler(text, "POST", "/whatsapp/:id/ticket")
    if not cod:
        print("! POST /whatsapp/:id/ticket não encontrado")
        sys.exit(1)
    cod = patch_wa_ticket(cod)
    text = put_handler(text, m, cod, end)
    text = patch_status_escalada(text)
    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓", ROUTES)


if __name__ == "__main__":
    main()
