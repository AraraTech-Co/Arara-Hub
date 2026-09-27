import type { Notification, Prisma, PrismaClient } from '@prisma/client'

export const NOTIFICATION_SEVERITIES = ['info', 'success', 'warning', 'critical'] as const
export type NotificationSeverity = (typeof NOTIFICATION_SEVERITIES)[number]

export type CreateNotificationInput = {
  userId: string
  title: string
  body: string
  severity?: string
  href?: string | null
  sourceApp?: string | null
  createdBy?: string | null
}

export type ListNotificationsOpts = {
  userId: string
  unreadOnly?: boolean
  limit?: number
  offset?: number
}

function normalizeSeverity(raw: unknown): NotificationSeverity {
  const s = String(raw || 'info').toLowerCase()
  if ((NOTIFICATION_SEVERITIES as readonly string[]).includes(s)) {
    return s as NotificationSeverity
  }
  return 'info'
}

export function serializeNotification(row: Notification) {
  return {
    id: row.id,
    userId: row.userId,
    title: row.title,
    body: row.body,
    severity: row.severity,
    href: row.href,
    sourceApp: row.sourceApp,
    read: row.readAt != null,
    readAt: row.readAt?.toISOString() ?? null,
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function createNotification(
  prisma: PrismaClient,
  input: CreateNotificationInput,
): Promise<Notification> {
  const title = String(input.title || '').trim()
  const body = String(input.body || '').trim()
  const userId = String(input.userId || '').trim()
  if (!userId) throw new Error('userId required')
  if (!title) throw new Error('title required')
  if (!body) throw new Error('body required')

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new Error('user not found')

  return prisma.notification.create({
    data: {
      userId,
      title,
      body,
      severity: normalizeSeverity(input.severity),
      href: input.href != null && String(input.href).trim() ? String(input.href).trim() : null,
      sourceApp:
        input.sourceApp != null && String(input.sourceApp).trim()
          ? String(input.sourceApp).trim()
          : null,
      createdBy: input.createdBy ?? null,
    },
  })
}

export async function listForUser(prisma: PrismaClient, opts: ListNotificationsOpts) {
  const take = Math.min(100, Math.max(1, Number(opts.limit) || 20))
  const skip = Math.max(0, Number(opts.offset) || 0)
  const where: Prisma.NotificationWhereInput = { userId: opts.userId }
  if (opts.unreadOnly) where.readAt = null

  const [rows, unreadCount, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      skip,
    }),
    prisma.notification.count({ where: { userId: opts.userId, readAt: null } }),
    prisma.notification.count({ where }),
  ])

  return {
    notifications: rows.map(serializeNotification),
    unreadCount,
    total,
    limit: take,
    offset: skip,
  }
}

export async function getNotification(prisma: PrismaClient, id: string) {
  return prisma.notification.findUnique({ where: { id } })
}

export async function markRead(prisma: PrismaClient, id: string) {
  return prisma.notification.update({
    where: { id },
    data: { readAt: new Date() },
  })
}

export async function markAllRead(prisma: PrismaClient, userId: string) {
  const result = await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  })
  return { count: result.count }
}

export async function updateNotification(
  prisma: PrismaClient,
  id: string,
  patch: {
    title?: string
    body?: string
    severity?: string
    href?: string | null
    sourceApp?: string | null
    read?: boolean
  },
) {
  const data: Prisma.NotificationUpdateInput = {}
  if (patch.title !== undefined) data.title = String(patch.title).trim()
  if (patch.body !== undefined) data.body = String(patch.body).trim()
  if (patch.severity !== undefined) data.severity = normalizeSeverity(patch.severity)
  if (patch.href !== undefined) {
    data.href = patch.href != null && String(patch.href).trim() ? String(patch.href).trim() : null
  }
  if (patch.sourceApp !== undefined) {
    data.sourceApp =
      patch.sourceApp != null && String(patch.sourceApp).trim()
        ? String(patch.sourceApp).trim()
        : null
  }
  if (patch.read === true) data.readAt = new Date()
  if (patch.read === false) data.readAt = null
  return prisma.notification.update({ where: { id }, data })
}

export async function deleteNotification(prisma: PrismaClient, id: string) {
  await prisma.notification.delete({ where: { id } })
}
