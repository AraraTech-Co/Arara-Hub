#!/usr/bin/env python3
# =============================================================================
# 3.3 — Limpar assigned_to ao resolver (só com flag) + takeover no assign.
# Aplica em packages/api/src/apps/portal-suporte/routes.generated.ts (fonte de prod).
#
# Histórico:
#   - Versão inicial zerava assigned_to em TODO resolve via PATCH/POST status.
#     Arrastar p/ Resolvido no Kanban perdia o dono; reabrir ficava órfão.
#   - Agora: limpa só com body.clear_assignee === true. Ao reabrir (sai de
#     resolvido sem dono), tenta devolver o último details.assignee_cleared.
#
#   python3 scripts/tickets-assignee-on-resolve.py
#   python3 scripts/tickets-assignee-on-resolve.py --aplicar
# =============================================================================

import os
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROUTES = os.path.join(
    RAIZ, "..", "..", "packages", "api", "src", "apps", "portal-suporte", "routes.generated.ts"
)
ROUTES = os.path.normpath(ROUTES)
MARCA = "scripts/tickets-assignee-on-resolve.py"

# Bloco antigo (auto-clear em todo resolve)
STATUS_AUTO_CLEAR = (
    '  var prevAssignee = ticket.assigned_to || ticket.assignedTo || null;\\n'
    '  if (isResolved && prevAssignee) {\\n'
    '    patch.assigned_to = null;\\n'
    '  }\\n'
)

# Bloco novo (flag + restore)
STATUS_FLAG_CLEAR = (
    '  var prevAssignee = ticket.assigned_to || ticket.assignedTo || null;\\n'
    '  // Limpar responsável só com flag explícita (scripts/tickets-assignee-on-resolve.py).\\n'
    '  // Arrastar p/ Resolvido sem clear_assignee mantém o dono — antes o PATCH\\n'
    '  // zerava sempre e o card reaberto ficava órfão.\\n'
    '  var clearAssignee = body.clear_assignee === true || body.clearAssignee === true;\\n'
    '  if (isResolved && clearAssignee && prevAssignee) {\\n'
    '    patch.assigned_to = null;\\n'
    '  }\\n'
    '  // Reabrir: se ficou sem dono ao resolver, devolve o último assignee_cleared.\\n'
    '  if (!isResolved && wasResolved && !prevAssignee && Log) {\\n'
    '    try {\\n'
    '      var _logs = (await Log.findMany({})) || [];\\n'
    '      var _restored = null;\\n'
    '      for (var _li = 0; _li < _logs.length; _li++) {\\n'
    '        var _lg = _logs[_li];\\n'
    '        if (String(_lg.ticket_id || _lg.ticketId || \\"\\") !== String(id)) continue;\\n'
    '        var _det = _lg.details || {};\\n'
    '        if (_det.assignee_cleared) {\\n'
    '          var _when = String(_lg.created_at || _lg.createdAt || \\"\\");\\n'
    '          if (!_restored || _when > _restored.when) _restored = { id: _det.assignee_cleared, when: _when };\\n'
    '        }\\n'
    '      }\\n'
    '      if (_restored && _restored.id) patch.assigned_to = _restored.id;\\n'
    '    } catch (_e) {}\\n'
    '  }\\n'
)

DETAILS_AUTO = (
    'assignee_cleared: isResolved && prevAssignee ? prevAssignee : null,\\n'
)
DETAILS_FLAG = (
    'assignee_cleared: isResolved && clearAssignee && prevAssignee ? prevAssignee : null,\\n'
)

# Primeira instalação (antes do auto-clear existir)
STATUS_BARE = (
    '  if (!isResolved && wasResolved) {\\n    patch.resolved_at = null;\\n  }\\n  var row = await Ticket.update(id, patch);'
)
STATUS_BARE_NEW = (
    '  if (!isResolved && wasResolved) {\\n    patch.resolved_at = null;\\n  }\\n'
    + STATUS_FLAG_CLEAR
    + '  var row = await Ticket.update(id, patch);'
)

ASSIGN_INSERT_OLD = (
    '  try {\\n    const row = await model.update(id, {\\n      assigned_to: assignee,\\n      updated_at: new Date().toISOString(),\\n    });'
)
ASSIGN_INSERT_NEW = (
    '  try {\\n    const ticket = await model.findById(id);\\n'
    '    if (!ticket) return ctx.reply.status(404).send({ error: "Ticket not found" });\\n'
    '    const fromUserId = ticket.assigned_to || ticket.assignedTo || null;\\n'
    '    var RESOLVED = {\\n'
    '      resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,\\n'
    '      post_mortem: 1, migracao_concluida: 1, fechado: 1\\n'
    '    };\\n'
    '    var force = body.force === true || body.takeover === true;\\n'
    '    var st = String(ticket.status || "");\\n'
    '    if (assignee && fromUserId && String(fromUserId) !== String(assignee) && !force && !RESOLVED[st]) {\\n'
    '      return ctx.reply.status(409).send({\\n'
    '        error: "Chamado já atribuído a outro atendente. Use assumir com confirmação.",\\n'
    '        assigned_to: fromUserId,\\n'
    '      });\\n'
    '    }\\n'
    '    const row = await model.update(id, {\\n      assigned_to: assignee,\\n      updated_at: new Date().toISOString(),\\n    });'
)

ASSIGN_INSERT_OLD_TICKET = (
    'const now = new Date().toISOString();\\n  const row = await Ticket.update(id, {\\n    assigned_to: assignee,'
)
ASSIGN_INSERT_NEW_TICKET = (
    'const now = new Date().toISOString();\\n'
    '  var RESOLVED = {\\n'
    '    resolvido: 1, resolvido_com_manual: 1, resolvido_sem_manual: 1,\\n'
    '    post_mortem: 1, migracao_concluida: 1, fechado: 1\\n'
    '  };\\n'
    '  var force = body.force === true || body.takeover === true;\\n'
    '  var st = String(ticket.status || "");\\n'
    '  if (assignee && fromUserId && String(fromUserId) !== String(assignee) && !force && !RESOLVED[st]) {\\n'
    '    return ctx.reply.status(409).send({\\n'
    '      error: "Chamado já atribuído a outro atendente. Use assumir com confirmação.",\\n'
    '      assigned_to: fromUserId,\\n'
    '    });\\n'
    '  }\\n'
    '  const row = await Ticket.update(id, {\\n    assigned_to: assignee,'
)

LOG_ASSIGN_OLD = (
    'reason: null,\\n        changed_at: now,\\n      });\\n    }\\n  } catch (e) {}\\n  try {\\n    if (Log) {\\n      await Log.create({\\n        ticket_id: id,\\n        user_id: actor,\\n        action: assignee ? "ticket_assigned" : "ticket_unassigned",\\n        details: { assigned_to: assignee },'
)
LOG_ASSIGN_NEW = (
    'reason: force ? "takeover" : null,\\n        changed_at: now,\\n      });\\n    }\\n  } catch (e) {}\\n  try {\\n    if (Log) {\\n      var takeover = assignee && fromUserId && String(fromUserId) !== String(assignee);\\n      await Log.create({\\n        ticket_id: id,\\n        user_id: actor,\\n        action: takeover ? "ticket_takeover" : (assignee ? "ticket_assigned" : "ticket_unassigned"),\\n        details: { assigned_to: assignee, from: fromUserId, force: !!force },'
)


def main():
    aplicar = "--aplicar" in sys.argv
    text = open(ROUTES, encoding="utf-8").read()
    mud = 0

    if STATUS_FLAG_CLEAR in text and DETAILS_FLAG in text:
        print("= clear_assignee + restore já aplicados")
    elif STATUS_AUTO_CLEAR in text:
        text = text.replace(STATUS_AUTO_CLEAR, STATUS_FLAG_CLEAR)
        mud += 1
        print(f"→ status: auto-clear → clear_assignee explícito ({text.count(STATUS_FLAG_CLEAR)}x)")
        if DETAILS_AUTO in text:
            text = text.replace(DETAILS_AUTO, DETAILS_FLAG)
            mud += 1
            print("→ activity log assignee_cleared só com flag")
    elif STATUS_BARE in text:
        text = text.replace(STATUS_BARE, STATUS_BARE_NEW, 1)
        mud += 1
        print("→ status: instalou clear_assignee + restore")
        details_old_bare = 'completed_by: isResolved ? actor : null,\\n        },'
        details_new_bare = (
            'completed_by: isResolved ? actor : null,\\n'
            '          assignee_cleared: isResolved && clearAssignee && prevAssignee ? prevAssignee : null,\\n'
            '        },'
        )
        if details_old_bare in text and 'assignee_cleared' not in text[
            text.find(details_old_bare) : text.find(details_old_bare) + 200
        ]:
            text = text.replace(details_old_bare, details_new_bare, 1)
            mud += 1
            print("→ activity log assignee_cleared")
    else:
        print("! bloco status assignee não encontrado")

    if DETAILS_AUTO in text:
        text = text.replace(DETAILS_AUTO, DETAILS_FLAG)
        mud += 1
        print("→ details: assignee_cleared com clearAssignee")

    n = text.count(ASSIGN_INSERT_OLD)
    if n:
        text = text.replace(ASSIGN_INSERT_OLD, ASSIGN_INSERT_NEW)
        mud += 1
        print(f"→ assign takeover ({n} handlers)")

    if ASSIGN_INSERT_OLD_TICKET in text and "var force = body.force" not in text[text.find(ASSIGN_INSERT_OLD_TICKET):text.find(ASSIGN_INSERT_OLD_TICKET)+800]:
        text = text.replace(ASSIGN_INSERT_OLD_TICKET, ASSIGN_INSERT_NEW_TICKET)
        mud += 1
        print("→ assign takeover (Ticket.update)")

    n2 = text.count(LOG_ASSIGN_OLD)
    if n2:
        text = text.replace(LOG_ASSIGN_OLD, LOG_ASSIGN_NEW)
        mud += 1
        print(f"→ assign log takeover ({n2})")

    if 'clear_assignee === true' in text and MARCA not in text[max(0, text.find('async function applyTicketStatusChange') - 120):text.find('async function applyTicketStatusChange') + 40]:
        text = text.replace(
            'async function applyTicketStatusChange',
            f'// {MARCA} — clear_assignee explícito + restore ao reabrir\\nasync function applyTicketStatusChange',
            1,
        )
        mud += 1
        print("→ marca no applyTicketStatusChange")

    if not mud and 'clear_assignee === true' in text:
        print("= já aplicado")
        return

    if not mud:
        sys.exit(1)

    if not aplicar:
        print("\\n(simulação — use --aplicar)")
        return

    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ gravado", ROUTES)


if __name__ == "__main__":
    main()
