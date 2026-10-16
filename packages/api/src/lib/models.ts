// `Prisma` entra como VALOR, não só como tipo: o caminho mascarado do
// `findMany` usa `Prisma.sql` e `Prisma.join`, que existem em tempo de
// execução. Com `import type` o código compilaria e quebraria ao rodar.
import { Prisma } from '@prisma/client'
import type { PrismaClient } from '@prisma/client'
import { z } from 'zod'

type JsonSchemaLike = {
  type?: string
  properties?: Record<string, { type?: string; required?: boolean }>
  required?: string[]
}

function zodFromJsonSchema(schema: JsonSchemaLike): z.ZodTypeAny {
  if (schema.type !== 'object' || !schema.properties) {
    return z.record(z.unknown())
  }

  const shape: Record<string, z.ZodTypeAny> = {}
  const required = new Set(schema.required ?? [])

  for (const [key, prop] of Object.entries(schema.properties)) {
    let field: z.ZodTypeAny
    switch (prop.type) {
      case 'string':
        field = z.string()
        break
      case 'number':
      case 'integer':
        field = z.number()
        break
      case 'boolean':
        field = z.boolean()
        break
      case 'array':
        field = z.array(z.unknown())
        break
      case 'object':
        field = z.record(z.unknown())
        break
      default:
        field = z.unknown()
    }
    shape[key] = required.has(key) ? field : field.nullable().optional()
  }

  return z.object(shape).passthrough()
}

export type ModelApi = {
  findMany: (filter?: Record<string, unknown>) => Promise<unknown[]>
  findById: (id: string) => Promise<unknown | null>
  create: (data: Record<string, unknown>) => Promise<unknown>
  update: (id: string, data: Record<string, unknown>) => Promise<unknown>
  delete: (id: string) => Promise<{ ok: true }>
}

/** App-scoped storage name: `{appSlug}-{ShortName}` e.g. portal-suporte-Ticket.
 *  Shared entities (User, Company, ApiKey, …) must NOT use this — plain PascalCase only.
 *  See `.cursor/rules/arara-shared-vs-app-models.mdc`.
 */
export function namespacedModelName(appSlug: string, name: string): string {
  const prefix = `${appSlug}-`
  if (name.startsWith(prefix)) return name
  // Reject accidental double-prefix from other apps; always bind to this slug
  const short = shortModelName(appSlug, name)
  return `${prefix}${short}`
}

/** Short alias used in controllers: Company */
export function shortModelName(appSlug: string, fullOrShort: string): string {
  const prefix = `${appSlug}-`
  if (fullOrShort.startsWith(prefix)) return fullOrShort.slice(prefix.length)
  // If someone passed another slug prefix, keep last PascalCase segment after final '-'
  // only when it looks like slug-Model (slug may contain hyphens)
  const idx = fullOrShort.lastIndexOf('-')
  if (idx > 0) {
    const maybeShort = fullOrShort.slice(idx + 1)
    if (/^[A-Z][A-Za-z0-9]*$/.test(maybeShort)) return maybeShort
  }
  return fullOrShort
}

export async function buildModelsApi(
  prisma: PrismaClient,
  appId: string,
  appSlug: string,
): Promise<Record<string, ModelApi>> {
  const defs = await prisma.modelDef.findMany({ where: { appId } })
  const apis: Record<string, ModelApi> = {}

  for (const def of defs) {
    const validator = zodFromJsonSchema(def.schema as JsonSchemaLike)
    const fullName = namespacedModelName(appSlug, def.name)
    const short = shortModelName(appSlug, fullName)
    // Records are keyed by whatever is stored on ModelDef.name (should be fullName)
    const modelName = def.name

    const api: ModelApi = {
      findMany: async (filter = {}) => {
        // Query-string pagination / search keys are not row fields
        const metaKeys = new Set([
          'mascararCampos',
          'limit',
          'offset',
          'page',
          'pageSize',
          'perPage',
          'sort',
          'order',
          'orderBy',
          'q',
          'search',
          'include',
          'fields',
        ])
        const takeRaw = filter.limit ?? filter.pageSize ?? filter.perPage
        const take = Math.min(
          500,
          Math.max(1, Number(takeRaw) || 500),
        )
        const offset = Math.max(0, Number(filter.offset) || 0)
        const fieldFilter = Object.fromEntries(
          Object.entries(filter).filter(([k]) => !metaKeys.has(k)),
        )
        const filterKeys = Object.keys(fieldFilter)

        const jsonAnd = filterKeys.map((k) => ({
          data: {
            path: [k],
            equals: fieldFilter[k] as Prisma.InputJsonValue,
          },
        }))

        // ── Mascarar campo pesado dentro do `data` (16/10/2026) ──────────────
        //
        // DESLIGADO por padrão: sem `mascararCampos`, nada abaixo acontece e o
        // comportamento é exatamente o de sempre, para todos os apps.
        //
        // Para que serve: há campo guardado dentro do `data` que a listagem
        // NÃO usa e que pesa megabytes — o anexo do WhatsApp em base64. O
        // `findMany` trazia a linha inteira do Postgres para o Node, que
        // descartava o conteúdo na hora. A cada 5 segundos, por atendente.
        //
        // MASCARA, não omite, e a diferença é função: quem lista pergunta
        // "tem anexo?" olhando se o campo existe. Removendo a chave, a
        // resposta passaria a dizer que não há anexo. Então o conteúdo é
        // trocado por um marcador curto, e a verdade sobre a existência
        // sobrevive.
        const mascarar = Array.isArray(filter.mascararCampos)
          ? (filter.mascararCampos as unknown[]).filter(
              (c): c is string => typeof c === 'string' && /^[A-Za-z0-9_]+$/.test(c),
            )
          : []
        // Só valores escalares no filtro: o caminho mascarado reescreve a
        // comparação à mão, e para qualquer coisa fora disso eu não consigo
        // provar que ele concorda com o caminho do Prisma. Nesse caso cai no
        // caminho de sempre, que é o certo a fazer quando não se pode provar.
        const filtroEscalar = filterKeys.every((k) => {
          const v = fieldFilter[k]
          return v === null || ['string', 'number', 'boolean'].includes(typeof v)
        })

        if (mascarar.length && filtroEscalar) {
          const onde: Prisma.Sql[] = [
            Prisma.sql`app_id = ${appId}`,
            Prisma.sql`model_name = ${modelName}`,
          ]
          for (const k of filterKeys) {
            const v = fieldFilter[k]
            if (v === null) onde.push(Prisma.sql`data->>${k} IS NULL`)
            else onde.push(Prisma.sql`data->>${k} = ${String(v)}`)
          }
          // `jsonb_exists` em vez do operador `?`: mesmo resultado, sem a
          // ambiguidade com marcador de parâmetro que morde em pooler e em log.
          //
          // O `CASE` é obrigatório porque `jsonb_set` CRIA a chave quando ela
          // não existe (`create_missing` é true por padrão): sem ele, mensagem
          // de texto passaria a dizer que tem anexo.
          let expr = Prisma.sql`data`
          for (const campo of mascarar) {
            expr = Prisma.sql`CASE WHEN jsonb_exists(${expr}, ${campo})
                AND ${expr}->>${campo} IS NOT NULL
              THEN jsonb_set(${expr}, ARRAY[${campo}], '"1"'::jsonb)
              ELSE ${expr} END`
          }
          const linhas = await prisma.$queryRaw<
            { id: string; data: Record<string, unknown>; created_at: Date; updated_at: Date }[]
          >(Prisma.sql`
            SELECT id, ${expr} AS data, created_at, updated_at
              FROM model_records
             WHERE ${Prisma.join(onde, ' AND ')}
             ORDER BY created_at DESC
             LIMIT ${take} OFFSET ${offset}
          `)
          return linhas.map((r) => {
            const data = r.data as Record<string, unknown>
            return {
              ...data,
              id: (typeof data.id === 'string' && data.id) || r.id,
              // Os dois caminhos têm de devolver o MESMO tipo, ou a comparação
              // byte a byte quebraria por um motivo que não tem nada a ver com
              // anexo. Medido no Postgres 16: o `$queryRaw` já devolve `Date`
              // para `timestamp without time zone`, então o `new Date` é só
              // uma cópia defensiva — nenhum teste consegue distingui-lo.
              createdAt: new Date(r.created_at),
              updatedAt: new Date(r.updated_at),
            }
          })
        }

        const records = await prisma.modelRecord.findMany({
          where: {
            appId,
            modelName,
            ...(jsonAnd.length ? { AND: jsonAnd } : {}),
          },
          orderBy: { createdAt: 'desc' },
          take,
          skip: offset,
        })
        return records.map((r) => {
          const data = r.data as Record<string, unknown>
          return {
            ...data,
            id: (typeof data.id === 'string' && data.id) || r.id,
            createdAt: r.createdAt,
            updatedAt: r.updatedAt,
          }
        })
      },

      findById: async (id: string) => {
        // Prefer storage PK, then data.id (app profiles keyed by platform User.id)
        let r = await prisma.modelRecord.findFirst({
          where: { id, appId, modelName },
        })
        if (!r) {
          r = await prisma.modelRecord.findFirst({
            where: {
              appId,
              modelName,
              data: { path: ['id'], equals: id },
            },
          })
        }
        if (!r) return null
        const data = r.data as Record<string, unknown>
        return {
          ...data,
          id: (typeof data.id === 'string' && data.id) || r.id,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      },

      create: async (data: Record<string, unknown>) => {
        const parsed = validator.safeParse(data)
        if (!parsed.success) {
          throw new Error(`Validation failed for ${fullName}: ${parsed.error.message}`)
        }
        const r = await prisma.modelRecord.create({
          data: {
            appId,
            modelName,
            data: parsed.data as Prisma.InputJsonValue,
          },
        })
        return { id: r.id, ...(r.data as object), createdAt: r.createdAt, updatedAt: r.updatedAt }
      },

      update: async (id: string, data: Record<string, unknown>) => {
        let existing = await prisma.modelRecord.findFirst({
          where: { id, appId, modelName },
        })
        if (!existing) {
          existing = await prisma.modelRecord.findFirst({
            where: { appId, modelName, data: { path: ['id'], equals: id } },
          })
        }
        if (!existing) throw new Error(`${fullName} not found: ${id}`)
        const merged = { ...(existing.data as object), ...data }
        const parsed = validator.safeParse(merged)
        if (!parsed.success) {
          throw new Error(`Validation failed for ${fullName}: ${parsed.error.message}`)
        }
        const r = await prisma.modelRecord.update({
          where: { id: existing.id },
          data: { data: parsed.data as Prisma.InputJsonValue },
        })
        const out = r.data as Record<string, unknown>
        return {
          ...out,
          id: (typeof out.id === 'string' && out.id) || r.id,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        }
      },

      delete: async (id: string) => {
        let existing = await prisma.modelRecord.findFirst({
          where: { id, appId, modelName },
        })
        if (!existing) {
          existing = await prisma.modelRecord.findFirst({
            where: { appId, modelName, data: { path: ['id'], equals: id } },
          })
        }
        if (!existing) throw new Error(`${fullName} not found: ${id}`)
        await prisma.modelRecord.delete({ where: { id: existing.id } })
        return { ok: true as const }
      },
    }

    // Controllers use short name; catalog/admin uses full name
    apis[fullName] = api
    apis[short] = api
    if (modelName !== fullName && modelName !== short) {
      apis[modelName] = api
    }
  }

  return apis
}
