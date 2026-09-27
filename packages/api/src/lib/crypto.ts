import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import type { PrismaClient } from '@prisma/client'

const JWT_SECRET = () => new TextEncoder().encode(process.env.JWT_SECRET ?? 'dev-secret')

export type JwtPayload = {
  sub: string
  email: string
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12)
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

export function accessTokenExpiresIn(): string {
  return process.env.JWT_EXPIRES_IN?.trim() || '7d'
}

export function refreshTokenExpiresDays(): number {
  const n = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS ?? 30)
  return Number.isFinite(n) && n > 0 ? n : 30
}

export async function signAccessToken(
  payload: JwtPayload,
  expiresIn = accessTokenExpiresIn(),
): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(JWT_SECRET())
}

export async function verifyAccessToken(token: string): Promise<JwtPayload> {
  const { payload } = await jwtVerify(token, JWT_SECRET())
  if (!payload.sub || typeof payload.email !== 'string') {
    throw new Error('Invalid token payload')
  }
  return { sub: payload.sub, email: payload.email }
}

export function hashRefreshToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex')
}

export function generateRefreshTokenRaw(): string {
  return `rt_${randomBytes(32).toString('base64url')}`
}

/** Issue opaque refresh token, store SHA-256 hash, return plaintext once. */
export async function issueRefreshToken(prisma: PrismaClient, userId: string): Promise<string> {
  const raw = generateRefreshTokenRaw()
  const days = refreshTokenExpiresDays()
  const expiresAt = new Date(Date.now() + days * 24 * 60 * 60 * 1000)
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashRefreshToken(raw),
      expiresAt,
    },
  })
  return raw
}

/**
 * Validate refresh token, revoke it, issue a new pair (rotation).
 * Returns null if invalid / expired / revoked.
 */
export async function rotateRefreshToken(
  prisma: PrismaClient,
  rawRefresh: string,
): Promise<{ accessToken: string; refreshToken: string; userId: string; email: string } | null> {
  const tokenHash = hashRefreshToken(rawRefresh)
  const row = await prisma.refreshToken.findUnique({
    where: { tokenHash },
    include: { user: true },
  })
  if (!row || row.revokedAt || row.expiresAt.getTime() <= Date.now()) {
    return null
  }
  if (row.user.status !== 'active') {
    return null
  }

  await prisma.refreshToken.update({
    where: { id: row.id },
    data: { revokedAt: new Date() },
  })

  const accessToken = await signAccessToken({ sub: row.user.id, email: row.user.email })
  const refreshToken = await issueRefreshToken(prisma, row.user.id)
  return {
    accessToken,
    refreshToken,
    userId: row.user.id,
    email: row.user.email,
  }
}

export function hashApiKey(rawKey: string): string {
  return createHash('sha256').update(rawKey).digest('hex')
}

export function generateApiKey(): { raw: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString('base64url')
  const raw = `sk_live_${secret}`
  const prefix = raw.slice(0, 16)
  return { raw, prefix, hash: hashApiKey(raw) }
}

export function appScopes(slug: string): string[] {
  return ['system:auth', 'system:readme', `app:${slug}:*`]
}

/** Machine/server key that can read serverOnly AppSecrets (not granted by app:slug:*). */
export function secretsReadScope(slug: string): string {
  return `app:${slug}:secrets:read`
}

/** UI + runtime default scopes, plus explicit secrets:read for server-side machine keys. */
export function machineAppScopes(slug: string): string[] {
  return [...appScopes(slug), secretsReadScope(slug)]
}

/**
 * Scope check. By default `app:slug:*` covers `app:slug:…`.
 * Pass `allowAppWildcard: false` for sensitive scopes (e.g. secrets:read) so UI keys cannot escalate.
 */
export function hasScope(
  scopes: string[],
  required: string,
  opts?: { allowAppWildcard?: boolean },
): boolean {
  if (scopes.includes(required)) return true
  const allowAppWildcard = opts?.allowAppWildcard !== false
  const [ns, rest] = required.split(':')
  if (!ns || !rest) return false
  if (allowAppWildcard && required.startsWith('app:')) {
    const parts = required.split(':')
    const slug = parts[1]
    if (slug && scopes.includes(`app:${slug}:*`)) return true
  }
  if (allowAppWildcard && scopes.includes(`${ns}:*`)) return true
  return false
}

export function hasExactScope(scopes: string[], required: string): boolean {
  return scopes.includes(required)
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
}
