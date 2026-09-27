export type AccessLevel = string

export const ACCESS_LEVELS = ['user', 'developer', 'admin', 'master'] as const
export type SystemAccessLevel = (typeof ACCESS_LEVELS)[number]

export type AuthContext =
  | { type: 'session'; userId: string; email: string; accessLevel: AccessLevel }
  | {
      type: 'apiKey'
      keyId: string
      accessLevel: AccessLevel
      routeGrants: string[]
      routeDenials: string[]
    }
