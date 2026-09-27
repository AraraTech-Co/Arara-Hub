import type { Prisma, PrismaClient } from '@prisma/client'
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
