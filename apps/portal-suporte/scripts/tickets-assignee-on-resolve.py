#!/usr/bin/env python3
# =============================================================================
# 3.3 — Limpar assigned_to ao resolver + takeover no PATCH/POST assign.
# Aplica em packages/api/src/apps/portal-suporte/routes.generated.ts (fonte de prod).
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

STATUS_OLD = (
    '  if (!isResolved && wasResolved) {\\n    patch.resolved_at = null;\\n  }\\n  var row = await Ticket.update(id, patch);'
)
STATUS_NEW = (
    '  if (!isResolved && wasResolved) {\\n    patch.resolved_at = null;\\n  }\\n'
    '  var prevAssignee = ticket.assigned_to || ticket.assignedTo || null;\\n'
    '  if (isResolved && prevAssignee) {\\n    patch.assigned_to = null;\\n  }\\n'
    '  var row = await Ticket.update(id, patch);'
)

DETAILS_OLD = (
    'completed_by: isResolved ? actor : null,\\n        },'
)
DETAILS_NEW = (
    'completed_by: isResolved ? actor : null,\\n'
    '          assignee_cleared: isResolved && prevAssignee ? prevAssignee : null,\\n'
    '        },'
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
ASSIGN_INSERT_NEW = (
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
    if MARCA in text:
        print("= já aplicado em routes.generated.ts")
        return

    mud = 0
    if STATUS_OLD in text:
        text = text.replace(STATUS_OLD, STATUS_NEW, 1)
        mud += 1
        print("→ status: limpar assigned_to ao resolver")
    else:
        print("! bloco status não encontrado (assignee clear)")

    if DETAILS_OLD in text:
        text = text.replace(DETAILS_OLD, DETAILS_NEW, 1)
        mud += 1
        print("→ activity log assignee_cleared")
    else:
        print("! bloco details não encontrado")

    n = text.count(ASSIGN_INSERT_OLD)
    if n:
        text = text.replace(ASSIGN_INSERT_OLD, ASSIGN_INSERT_NEW)
        mud += 1
        print(f"→ assign takeover ({n} handlers)")
    else:
        print("! bloco assign não encontrado")

    n2 = text.count(LOG_ASSIGN_OLD)
    if n2:
        text = text.replace(LOG_ASSIGN_OLD, LOG_ASSIGN_NEW)
        mud += 1
        print(f"→ assign log takeover ({n2})")
    else:
        print("! bloco assign log não encontrado")

    if not mud:
        sys.exit(1)

    text = text.replace(
        'async function applyTicketStatusChange',
        f'// {MARCA}\\nasync function applyTicketStatusChange',
        1,
    )

    if not aplicar:
        print("\\n(simulação — use --aplicar)")
        return

    open(ROUTES, "w", encoding="utf-8").write(text)
    print("✓ gravado", ROUTES)


if __name__ == "__main__":
    main()
