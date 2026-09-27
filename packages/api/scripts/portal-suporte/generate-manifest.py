#!/usr/bin/env python3
"""Generate data/portal-suporte-manifest.json from API routes + column dump + Prisma map."""
from __future__ import annotations

import hashlib
import json
import pathlib
import re
import secrets
from collections import defaultdict

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATA = ROOT / "data"
PROD = DATA / "portal-suporte-prod"
ROUTES = json.loads((DATA / "portal-suporte-api-routes.json").read_text())
COLS = json.loads((PROD / "_columns.json").read_text())
TABLE_MODEL = json.loads((DATA / "portal-suporte-table-models.json").read_text())

MANIFEST_PATH = DATA / "portal-suporte-manifest.json"
KEY_PATH = DATA / "portal-suporte-api-key.txt"

USER_ID = "ps_platform_user_0001"
APP_ID = "ps_platform_app_0001"
API_KEY_ID = "ps_platform_key_0001"

if MANIFEST_PATH.exists():
    old = json.loads(MANIFEST_PATH.read_text())
    API_KEY_RAW = old["apiKey"]["raw"]
    API_KEY_PREFIX = old["apiKey"]["prefix"]
    API_KEY_HASH = old["apiKey"]["hash"]
else:
    API_KEY_RAW = f"sk_live_{secrets.token_urlsafe(24)}"
    API_KEY_PREFIX = API_KEY_RAW[:16]
    API_KEY_HASH = hashlib.sha256(API_KEY_RAW.encode()).hexdigest()

KEY_PATH.write_text(API_KEY_RAW + "\n")


APP_SLUG = "portal-suporte"


def model_for_table(table: str) -> str:
    return TABLE_MODEL.get(table) or "".join(p.capitalize() for p in table.split("_"))


def storage_model_name(short: str) -> str:
    """Canonical DB name: portal-suporte-Company"""
    return f"{APP_SLUG}-{short}"


by_table: dict[str, list] = defaultdict(list)
for c in COLS:
    by_table[c["table_name"]].append(c)
tables = sorted(by_table.keys())


def schema_for(table: str) -> dict:
    props = {}
    for c in by_table[table]:
        name = c["column_name"]
        dt, udt = c["data_type"], c["udt_name"]
        if dt in ("integer", "bigint", "smallint", "numeric", "double precision", "real"):
            t = "number"
        elif dt == "boolean":
            t = "boolean"
        elif dt in ("json", "jsonb") or udt in ("json", "jsonb"):
            t = "object"
        elif "ARRAY" in (dt or "").upper() or udt.startswith("_"):
            t = "array"
        else:
            t = "string"
        props[name] = {"type": t}
    return {"type": "object", "properties": props}


SEGMENT_MODEL = {
    "tickets": "Ticket",
    "companies": "Company",
    "profiles": "Profile",
    "users": "User",
    "tasks": "Task",
    "teams": "Team",
    "units": "Unit",
    "messages": "TicketMessage",
    "notifications": "Notification",
    "webhooks": "Webhook",
    "templates": "MessageTemplate",
    "schedules": "SupportSchedule",
    "ssh-servers": "SshServer",
    "invite-codes": "InviteCode",
    "api-keys": "APIKey",
    "attachments": "Attachment",
    "reports": "ReportSnapshot",
    "incidents": "Incident",
    "whatsapp": "WhatsAppConversation",
    "knowledge": "KnowledgeArticle",
    "permissions": "RbacPermission",
    "automation": "AutomationRule",
    "settings": "SystemSettings",
    "sla-contracts": "SlaContract",
    "sla-calendar": "SlaCalendarException",
    "feed": "ActivityLog",
    "audit": "ActivityLog",
    "groups": "CompanyGroup",
    "contacts": "CompanyContact",
    "caixas": "UnitCaixa",
    "members": "TeamMember",
    "checklists": "TicketChecklist",
    "ratings": "TicketRating",
    "manuals": "SupportManual",
    "post-mortem": "PostMortem",
    "time-entries": "TicketTimeEntry",
    "co-assignees": "TicketCoAssignee",
}

NESTED = {
    ("tickets", "messages"): ("TicketMessage", "ticket_id"),
    ("tickets", "checklists"): ("TicketChecklist", "ticket_id"),
    ("tickets", "time-entries"): ("TicketTimeEntry", "ticket_id"),
    ("tickets", "co-assignees"): ("TicketCoAssignee", "ticket_id"),
    ("tickets", "events"): ("ActivityLog", "ticket_id"),
    ("companies", "contacts"): ("CompanyContact", "company_id"),
    ("companies", "units"): ("Unit", "company_id"),
    ("units", "caixas"): ("UnitCaixa", "unit_id"),
    ("units", "whatsapps"): ("UnitWhatsapp", "unit_id"),
    ("teams", "members"): ("TeamMember", "team_id"),
    ("whatsapp", "messages"): ("WhatsAppMessage", "conversation_id"),
    ("whatsapp", "groups"): ("WhatsAppGroup", None),
}


def infer_model_and_fk(path: str) -> tuple[str, str | None]:
    parts = [p for p in path.strip("/").split("/") if p]
    plain = [p for p in parts if not p.startswith(":")]
    non_admin = [p for p in plain if p != "admin"]
    if len(non_admin) >= 2:
        nest = (non_admin[-2], non_admin[-1])
        if nest in NESTED:
            return NESTED[nest]
    for p in reversed(non_admin):
        if p in SEGMENT_MODEL:
            return SEGMENT_MODEL[p], None
        snake = p.replace("-", "_")
        if snake in TABLE_MODEL:
            return TABLE_MODEL[snake], None
    return "Ticket", None


def controller_code(method: str, path: str, model: str, parent_fk: str | None) -> str:
    params = re.findall(r":([A-Za-z0-9_]+)", path)
    id_param = params[-1] if params else "id"
    ends_with_id = bool(re.search(r"/:[^/]+$", path))

    if method == "GET" and ends_with_id and not (parent_fk and path.count(":") >= 2 and path.rstrip("/").endswith(f":{id_param}") and any(s in path for s in ("/messages", "/checklists", "/contacts", "/units", "/members", "/caixas", "/whatsapps", "/time-entries", "/co-assignees", "/events"))):
        # detail get on resource itself
        # nested detail still uses last param as row id
        pass

    if method == "GET" and ends_with_id and parent_fk is None:
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const row = await model.findById(ctx.params.{id_param});
  if (!row) return ctx.reply.status(404).send({{ error: "Not found" }});
  return ctx.reply.send(row);
}}
module.exports = {{ handler }};"""

    if method == "GET" and ends_with_id and parent_fk:
        # e.g. /tickets/:id/messages/:messageId — treat last as id
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const row = await model.findById(ctx.params.{id_param});
  if (!row) return ctx.reply.status(404).send({{ error: "Not found" }});
  return ctx.reply.send(row);
}}
module.exports = {{ handler }};"""

    if method == "GET":
        if parent_fk:
            # nested list: /tickets/:id/messages
            parent_param = params[0] if params else "id"
            return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const filter = Object.assign({{}}, ctx.query || {{}});
  filter.{parent_fk} = ctx.params.{parent_param};
  const rows = await model.findMany(filter);
  return ctx.reply.send({{ data: rows, count: rows.length }});
}}
module.exports = {{ handler }};"""
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const filter = Object.assign({{}}, ctx.query || {{}});
  const rows = await model.findMany(filter);
  return ctx.reply.send({{ data: rows, count: rows.length }});
}}
module.exports = {{ handler }};"""

    if method == "POST":
        fk_line = ""
        if parent_fk and params:
            fk_line = f'if (!body.{parent_fk}) body.{parent_fk} = ctx.params.{params[0]};'
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const body = Object.assign({{}}, ctx.body || {{}});
  {fk_line}
  const row = await model.create(body);
  return ctx.reply.status(201).send(row);
}}
module.exports = {{ handler }};"""

    if method in ("PATCH", "PUT"):
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const id = ctx.params.{id_param} || ctx.params.id;
  if (!id) return ctx.reply.status(400).send({{ error: "Missing id" }});
  try {{
    const row = await model.update(id, ctx.body || {{}});
    return ctx.reply.send(row);
  }} catch (e) {{
    return ctx.reply.status(404).send({{ error: String(e.message || e) }});
  }}
}}
module.exports = {{ handler }};"""

    if method == "DELETE":
        return f"""async function handler(ctx) {{
  const model = ctx.models.{model};
  if (!model) return ctx.reply.status(500).send({{ error: "Model {model} missing" }});
  const id = ctx.params.{id_param} || ctx.params.id;
  if (!id) return ctx.reply.status(400).send({{ error: "Missing id" }});
  try {{
    await model.delete(id);
    return ctx.reply.send({{ ok: true }});
  }} catch (e) {{
    return ctx.reply.status(404).send({{ error: String(e.message || e) }});
  }}
}}
module.exports = {{ handler }};"""

    return f"""async function handler(ctx) {{
  return ctx.reply.status(501).send({{ error: "Not implemented", method: "{method}", path: "{path}", model: "{model}" }});
}}
module.exports = {{ handler }};"""


modules: dict[str, list] = defaultdict(list)
for r in ROUTES:
    path = r["path"]
    methods = r["methods"] or ["GET"]
    if path in ("/cron/sla-check", "/webhooks/whatsapp"):
        methods = ["GET", "POST"]
    parts = [p for p in path.strip("/").split("/") if p]
    if not parts:
        mod_name = "root"
    elif parts[0] == "admin" and len(parts) > 1:
        mod_name = "admin_" + parts[1].replace("-", "_")
    else:
        mod_name = parts[0].replace("-", "_")
    mod_name = re.sub(r"[^a-zA-Z0-9_]", "_", mod_name)
    if mod_name[0].isdigit():
        mod_name = "m_" + mod_name
    model, parent_fk = infer_model_and_fk(path)
    for m in methods:
        modules[mod_name].append(
            {
                "method": m,
                "path": path if path.startswith("/") else "/" + path,
                "model": model,
                "controllerCode": controller_code(m, path, model, parent_fk),
            }
        )

manifest = {
    "app": {
        "id": APP_ID,
        "slug": APP_SLUG,
        "name": "Portal Suporte",
        "description": "Portal de suporte AraraTech — endpoints e dados migrados da produção Hostinger-Suporte",
        "ownerUserId": USER_ID,
    },
    "user": {
        "id": USER_ID,
        "email": "portal-suporte@arara.local",
        "name": "Portal Suporte Service",
        "password": "portal-suporte123",
    },
    "apiKey": {
        "id": API_KEY_ID,
        "raw": API_KEY_RAW,
        "prefix": API_KEY_PREFIX,
        "hash": API_KEY_HASH,
        "scopes": ["system:auth", "system:readme", f"app:{APP_SLUG}:*"],
    },
    "models": [
        {
            "name": storage_model_name(model_for_table(t)),
            "shortName": model_for_table(t),
            "table": t,
            "schema": schema_for(t),
        }
        for t in tables
    ],
    "modules": [{"name": n, "routes": rs} for n, rs in sorted(modules.items())],
}

MANIFEST_PATH.write_text(json.dumps(manifest))
print(
    f"wrote {MANIFEST_PATH} models={len(manifest['models'])} "
    f"modules={len(manifest['modules'])} routes={sum(len(m['routes']) for m in manifest['modules'])}"
)
print(f"api key: {API_KEY_RAW}")
