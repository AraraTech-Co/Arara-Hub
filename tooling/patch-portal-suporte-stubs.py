#!/usr/bin/env python3
"""Fix portal-suporte routes.generated.ts stubs with a correct string parser.

Previous regex truncated on some escaped sequences and left adjacent
string literals. This version finds each route by path and rewrites the
full compileController("...") argument.
"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "packages/api/src/apps/portal-suporte/routes.generated.ts"

VERBO_PATHS = {
    ("POST", "/admin/ai/knowledge/embed-all"),
    ("GET", "/admin/ai/knowledge/embed-all"),
    ("GET", "/admin/ai/train"),
    ("GET", "/admin/impersonate"),
    ("POST", "/admin/ssh-servers/execute"),
    ("POST", "/change-requests/:id/approve"),
    ("POST", "/change-requests/:id/schedule"),
    ("POST", "/change-requests/:id/complete"),
    ("POST", "/change-requests/:id/fail"),
    ("POST", "/change-requests/:id/reject"),
    ("POST", "/change-requests/:id/start"),
    ("POST", "/change-requests/:id/submit"),
    ("GET", "/search/sync"),
    ("POST", "/tasks/:id/assign"),
    ("POST", "/tasks/:id/complete"),
}

BULK_HANDLER = """async function handler(ctx) {
  // GERADO/CORRIGIDO — bulk-action real (não criar Ticket com {ids,action})
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const body = ctx.body || {};
  const ids = Array.isArray(body.ids) ? body.ids.map(String).filter(Boolean) : [];
  const action = String(body.action || "");
  if (!ids.length) return ctx.reply.status(400).send({ error: "ids required" });
  if (!action) return ctx.reply.status(400).send({ error: "action required" });

  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  let updated = 0;

  for (const id of ids) {
    const ticket = await Ticket.findById(id);
    if (!ticket) continue;
    const patch = { updated_at: now };
    let logAction = null;
    let details = {};

    if (action === "archive") {
      patch.is_archived = true;
      patch.archived_at = now;
      logAction = "ticket_archived";
    } else if (action === "assign") {
      const assignTo = body.assignTo !== undefined ? body.assignTo : body.assigned_to;
      patch.assigned_to = assignTo === "" || assignTo === null ? null : assignTo;
      logAction = "ticket_assigned";
      details = { assigned_to: patch.assigned_to };
    } else if (action === "set_priority") {
      if (!body.priority) return ctx.reply.status(400).send({ error: "priority required" });
      patch.priority = body.priority;
      logAction = "priority_changed";
      details = { from: ticket.priority || null, to: body.priority };
    } else if (action === "set_status") {
      if (!body.status) return ctx.reply.status(400).send({ error: "status required" });
      patch.status = body.status;
      logAction = "status_changed";
      details = { from: ticket.status || null, to: body.status };
    } else {
      return ctx.reply.status(400).send({ error: "Unknown action: " + action });
    }

    await Ticket.update(id, patch);
    updated += 1;
    if (Log && logAction) {
      try {
        await Log.create({
          ticket_id: id,
          user_id: actor,
          action: logAction,
          details: details,
          created_at: now,
          visible_to_client: false,
        });
      } catch (e) {}
    }
    if (action === "assign" && patch.assigned_to && String(patch.assigned_to) !== String(actor || "") && typeof ctx.notify === "function") {
      try {
        const num = ticket.ticket_number || ticket.ticketNumber || id;
        await ctx.notify({
          userId: String(patch.assigned_to),
          title: "Card atribuído a você",
          body: "O chamado " + num + " foi atribuído para você: " + (ticket.title || ""),
          severity: "info",
          href: "https://suporte.arara-tech.com/admin/tickets/view?id=" + encodeURIComponent(id),
          sourceApp: "portal-suporte",
        });
      } catch (e) {}
    }
  }

  return ctx.reply.send({ updated: updated, success: true });
}
"""

ARCHIVE_HANDLER = """async function handler(ctx) {
  // GERADO/CORRIGIDO — arquivar ticket (is_archived)
  const Ticket = ctx.models.Ticket;
  const Log = ctx.models.ActivityLog;
  if (!Ticket) return ctx.reply.status(500).send({ error: "Model Ticket missing" });
  const id = ctx.params.id;
  if (!id) return ctx.reply.status(400).send({ error: "Missing id" });
  const ticket = await Ticket.findById(id);
  if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });
  const now = new Date().toISOString();
  const actor = (ctx.user && (ctx.user.id || ctx.user.userId)) || null;
  const row = await Ticket.update(id, {
    is_archived: true,
    archived_at: now,
    updated_at: now,
  });
  if (Log) {
    try {
      await Log.create({
        ticket_id: id,
        user_id: actor,
        action: "ticket_archived",
        details: {},
        created_at: now,
        visible_to_client: false,
      });
    } catch (e) {}
  }
  return ctx.reply.send({ success: true, data: row });
}
"""


def stub_501(method: str, path: str) -> str:
    return f"""async function handler(ctx) {{
  // GERADO AUTOMATICAMENTE — NÃO IMPLEMENTADO
  return ctx.reply.status(501).send({{
    error: "Not implemented",
    hint: "Stub de integração: rota de ação sem controller real",
    method: "{method}",
    path: "{path}",
  }});
}}
"""


def find_string_end(text: str, start_quote: int) -> int:
    """start_quote points at opening \"; return index of closing \"."""
    assert text[start_quote] == '"'
    j = start_quote + 1
    esc = False
    while j < len(text):
        c = text[j]
        if esc:
            esc = False
        elif c == "\\":
            esc = True
        elif c == '"':
            return j
        j += 1
    raise ValueError("unterminated string")


def extract_compile_controller_span(text: str, route_start: int) -> tuple[int, int, str]:
    """Return (arg_start_quote, after_closing_paren, decoded_code).

    Handles broken adjacent-string forms: compileController("a" "b").
    """
    h = text.find("handler: compileController(", route_start)
    if h < 0 or h > route_start + 500:
        raise ValueError("handler not found near route")
    p = h + len("handler: compileController(")
    while text[p] in " \t\n":
        p += 1
    if text[p] != '"':
        raise ValueError(f"expected string at {p}, got {text[p]!r}")

    chunks: list[str] = []
    first_quote = p
    while True:
        while text[p] in " \t\n":
            p += 1
        if text[p] != '"':
            break
        end = find_string_end(text, p)
        raw = text[p : end + 1]
        chunks.append(json.loads(raw))
        p = end + 1
        while text[p] in " \t\n":
            p += 1
        # adjacent string continues; otherwise expect )
        if text[p] != '"':
            break

    # Healthy form ends with ). Broken prior patch left: compileController("a" "b"),
    if text[p] == ")":
        after = p + 1
    elif text[p] == ",":
        # Span ends at comma so caller can write dumps + )
        after = p
    else:
        raise ValueError(f"expected ) or , after compileController strings, got {text[p:p+20]!r}")
    code = "".join(chunks)
    return first_quote, after, code


def replace_inner_handler(code: str, new_handler: str) -> str:
    start = code.find("async function handler")
    if start < 0:
        # Keep preamble if any helpers exist before a missing handler — append
        nh = new_handler.rstrip() + "\n\n"
        if "module.exports" in code:
            # insert before module.exports
            mx = code.find("module.exports")
            return code[:mx] + nh + code[mx:]
        return code.rstrip() + "\n\n" + nh + "module.exports = { handler };\n"

    markers = [
        "\n// ── Controle de acesso",
        "\n// ── Guarda de sessão",
        "\nvar _RANK",
        "\nvar _handlerOriginal",
        "\nvar _gsRANK",
        "\nvar _gsOriginal",
        "\nmodule.exports",
    ]
    end = len(code)
    for m in markers:
        i = code.find(m, start)
        if i >= 0:
            end = min(end, i)
    nh = new_handler.rstrip() + "\n\n"
    return code[:start] + nh + code[end:]


def find_route(text: str, method: str, path: str) -> int:
    """Return index of `path: "..."` for the matching method entry."""
    needle = f'path: "{path}"'
    start = 0
    while True:
        i = text.find(needle, start)
        if i < 0:
            raise ValueError(f"path not found: {path}")
        window = text[max(0, i - 120) : i]
        if f'method: "{method}"' in window:
            return i
        start = i + 1


def rewrite_route(text: str, method: str, path: str, new_handler: str) -> str:
    route_at = find_route(text, method, path)
    first_quote, after_paren, code = extract_compile_controller_span(text, route_at)
    # If previous broken patch left concatenated duplicates, keep only until first
    # module.exports and drop trailing duplicate controllers.
    exports = []
    idx = 0
    while True:
        j = code.find("module.exports", idx)
        if j < 0:
            break
        exports.append(j)
        idx = j + 1
    if len(exports) > 1:
        # keep first controller only (up to end of first module.exports line)
        line_end = code.find("\n", exports[0])
        if line_end < 0:
            line_end = len(code)
        code = code[: line_end + 1]

    new_code = replace_inner_handler(code, new_handler)
    # Replace from opening " through end of arg; always emit one string + )
    # after_paren points just past ')' OR at ',' if ')' was missing
    if after_paren > 0 and text[after_paren - 1] == ")":
        return text[:first_quote] + json.dumps(new_code) + text[after_paren - 1 :]
    return text[:first_quote] + json.dumps(new_code) + ")" + text[after_paren:]


def needs_501(code: str) -> bool:
    if "NÃO IMPLEMENTADO" in code and "501" in code and "Stub de integração" in code:
        return False
    if "501" in code and "Rota não implementada" in code:
        # already loud 501 from earlier fix-mismatched — leave or refresh
        return True  # refresh message for consistency on VERBO list
    # Generic CRUD used as action stub
    if ".create(" in code and ("ctx.body" in code or "Object.assign" in code):
        return True
    if ".update(" in code and "ctx.body" in code:
        return True
    if ".findMany(" in code or ".findById(" in code:
        return True
    return True


def main() -> None:
    text = TARGET.read_text()
    stats = {"bulk": 0, "archive": 0, "verb_501": 0}

    text = rewrite_route(text, "POST", "/tickets/bulk-action", BULK_HANDLER)
    stats["bulk"] = 1
    text = rewrite_route(text, "PATCH", "/tickets/:id/archive", ARCHIVE_HANDLER)
    stats["archive"] = 1

    for method, path in sorted(VERBO_PATHS):
        # Always rewrite VERBOs: may already be 501 but with broken adjacent strings
        text = rewrite_route(text, method, path, stub_501(method, path))
        stats["verb_501"] += 1

    TARGET.write_text(text)
    print(f"Patched {TARGET}")
    print(stats)

    # verify no adjacent strings on patched routes
    for method, path in [("POST", "/tickets/bulk-action"), ("PATCH", "/tickets/:id/archive")]:
        route_at = find_route(text, method, path)
        fq, ap, code = extract_compile_controller_span(text, route_at)
        raw_arg = text[fq:ap]
        # after first string close, should be )
        end = find_string_end(text, fq)
        after = text[end + 1 : end + 5].lstrip()
        assert after.startswith(")"), f"adjacent strings still present for {method} {path}: {text[end:end+40]!r}"
        assert code.count("async function handler") == 1, (method, path, code.count("async function handler"))
        assert "GERADO/CORRIGIDO" in code, (method, path)
        print(f"OK {method} {path} handlers={code.count('async function handler')} len={len(code)}")


if __name__ == "__main__":
    main()
