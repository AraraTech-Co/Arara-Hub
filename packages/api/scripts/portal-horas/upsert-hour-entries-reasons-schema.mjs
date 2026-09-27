/**
 * Merge `reasons` (string[]) into time-management HourEntries ModelDef schema.
 * node scripts/time-management/upsert-hour-entries-reasons-schema.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()
const APP_SLUG = 'time-management'
const CANDIDATES = [`${APP_SLUG}-HourEntries`, 'HourEntries', 'HourEntry', `${APP_SLUG}-HourEntry`]

async function main() {
  const app = await prisma.app.findUnique({ where: { slug: APP_SLUG } })
  if (!app) throw new Error(`App ${APP_SLUG} not found`)

  let def = null
  for (const name of CANDIDATES) {
    def = await prisma.modelDef.findFirst({ where: { appId: app.id, name } })
    if (def) break
  }
  if (!def) throw new Error('HourEntries ModelDef not found')

  const schema =
    def.schema && typeof def.schema === 'object' && !Array.isArray(def.schema)
      ? structuredClone(def.schema)
      : { type: 'object', properties: {} }

  if (!schema.properties || typeof schema.properties !== 'object') {
    schema.properties = {}
  }
  schema.type = schema.type || 'object'
  schema.properties.reasons = {
    type: 'array',
    items: { type: 'string' },
    description: 'Stable reason ids for EXTRA / BIP entries',
  }

  await prisma.modelDef.update({
    where: { id: def.id },
    data: { schema },
  })
  console.log(`✓ Updated schema on ModelDef ${def.name} (+reasons)`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
