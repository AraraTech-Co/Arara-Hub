// Gera SQL de INSERT dos prospectos no POOL (ownerId NULL, type lead, source importação).
// Uso: node scripts/gen-leads-sql.mjs > scripts/import-leads.sql
// Dados em scripts/leads-data.txt, campos separados por " || ":
//   Empresa || Sede || Gestor || Telefone || Email || Ramo || QtdLojas || Obs
import { readFileSync } from "node:fs"

const raw = readFileSync(new URL("./leads-data.txt", import.meta.url), "utf8")
const q = (s) => "'" + String(s ?? "").replace(/'/g, "''").trim() + "'"
const firstOf = (s) => (s || "").split("/")[0].trim()
const firstEmail = (s) =>
  (s || "").split(/[\s/]+/).map((x) => x.trim()).find((x) => x.includes("@")) || ""

const lines = raw.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))
const rows = []
for (const line of lines) {
  const f = line.split("||").map((x) => x.trim())
  const [empresa, sede, gestor, tel, email, ramo, lojas, obs] = f
  const notes = [
    gestor ? `Gestor: ${gestor}` : "",
    lojas ? `Lojas: ${lojas}` : "",
    (tel || "").includes("/") ? `Tel: ${tel}` : "",
    (email || "").match(/[\s/].*@/) ? `E-mails: ${email}` : "",
    obs ? `Obs: ${obs}` : "",
  ].filter(Boolean).join(" | ")
  const tags = [ramo, "prospecto"].filter(Boolean)
  rows.push({
    name: empresa,
    company: sede || null,
    phone: firstOf(tel) || null,
    email: firstEmail(email) || null,
    tags,
    notes: notes || null,
  })
}

console.log("BEGIN;")
for (const r of rows) {
  const tagsSql = "ARRAY[" + r.tags.map(q).join(",") + "]::text[]"
  console.log(
    `INSERT INTO "Client" (id, name, company, email, phone, type, source, "ownerId", tags, notes, "createdAt") ` +
      `VALUES (gen_random_uuid()::text, ${q(r.name)}, ${r.company ? q(r.company) : "NULL"}, ` +
      `${r.email ? q(r.email) : "NULL"}, ${r.phone ? q(r.phone) : "NULL"}, 'lead', 'importação', NULL, ` +
      `${tagsSql}, ${r.notes ? q(r.notes) : "NULL"}, now());`
  )
}
console.log("COMMIT;")
console.error(`Gerados ${rows.length} INSERTs.`)
