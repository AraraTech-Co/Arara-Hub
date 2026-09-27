import { api } from './client'

export interface SshServer {
  id: string
  name: string
  host: string
  port: number
  username: string
  status?: string
}

export interface PingResult {
  host: string
  online: boolean
  latency: number | null
  timestamp: string
}

export interface SslInfo {
  valid: boolean
  expiresAt: string
  issuer: string
  daysRemaining: number
}

export interface ServerMetrics {
  cpu: number
  memoryUsed: number
  memoryTotal: number
  diskUsed: number
  diskTotal: number
}

export interface ContainerInfo {
  id: string
  name: string
  status: string
  image: string
}

export const devopsApi = {
  ping: (host: string) =>
    api.get<PingResult>(`/api/devops/ping?host=${encodeURIComponent(host)}`),

  pingAll: () =>
    api.post<PingResult[]>('/api/devops/ping-all', {}),

  connect: (serverId: string) =>
    api.post<{ token: string }>('/api/devops/connect', { serverId }),

  checkSsl: (serverId: string) =>
    api.get<SslInfo>(`/api/devops/${serverId}/ssl`),

  getMetrics: (serverId: string) =>
    api.get<ServerMetrics>(`/api/devops/${serverId}/metrics`),

  getProcesses: (serverId: string) =>
    api.get<{ processes: unknown[] }>(`/api/devops/${serverId}/processes`),

  getContainers: (serverId: string) =>
    api.get<ContainerInfo[]>(`/api/devops/${serverId}/containers`),

  restartContainer: (serverId: string, ref: string) =>
    api.post(`/api/devops/${serverId}/containers/${ref}/restart`, {}),

  stopContainer: (serverId: string, ref: string) =>
    api.post(`/api/devops/${serverId}/containers/${ref}/stop`, {}),

  startContainer: (serverId: string, ref: string) =>
    api.post(`/api/devops/${serverId}/containers/${ref}/start`, {}),

  reboot: (serverId: string) =>
    api.post(`/api/devops/${serverId}/reboot`, {}),

  getLogs: (serverId: string) =>
    api.get(`/api/devops/${serverId}/logs-analysis`),

  listFiles: (serverId: string, path: string) =>
    api.post(`/api/devops/${serverId}/files/list`, { path }),

  readFile: (serverId: string, path: string) =>
    api.post(`/api/devops/${serverId}/files/read`, { path }),

  writeFile: (serverId: string, path: string, content: string) =>
    api.post(`/api/devops/${serverId}/files/write`, { path, content }),

  executeFile: (serverId: string, path: string) =>
    api.post(`/api/devops/${serverId}/files/execute`, { path }),

  getCrontab: (serverId: string) =>
    api.get(`/api/devops/${serverId}/crontab`),
}
