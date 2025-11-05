import type { RobotMission } from 'dorita980'
import type { Logger } from 'homebridge'

import type { IRoombaClient } from './IRoombaClient.js'

// Stub implementation for future REST-based control via rest980
export class Rest980Client implements IRoombaClient {
  constructor(private readonly baseUrl: string, private readonly log: Logger) {}

  private async request<T = unknown>(path: string, init?: RequestInit): Promise<T> {
    const url = new URL(path, this.baseUrl).toString()
    const res = await fetch(url, {
      headers: {
        'content-type': 'application/json',
      },
      ...init,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`rest980 ${init?.method || 'GET'} ${path} failed: ${res.status} ${res.statusText} ${text}`)
    }
    const ct = res.headers.get('content-type') || ''
    if (ct.includes('application/json')) {
      return await res.json() as T
    }
    return undefined as unknown as T
  }

  end = (): void => {
    // no persistent connection in REST mode
  }

  clean = async (): Promise<void> => {
    await this.request('/commands/clean', { method: 'POST', body: '{}' })
  }

  cleanRoom = async (mission: RobotMission | Record<string, unknown>): Promise<void> => {
    await this.request('/commands/cleanRoom', { method: 'POST', body: JSON.stringify({ mission }) })
  }

  pause = async (): Promise<void> => {
    await this.request('/commands/pause', { method: 'POST', body: '{}' })
  }

  resume = async (): Promise<void> => {
    await this.request('/commands/resume', { method: 'POST', body: '{}' })
  }

  dock = async (): Promise<void> => {
    await this.request('/commands/dock', { method: 'POST', body: '{}' })
  }

  find = async (): Promise<void> => {
    await this.request('/commands/find', { method: 'POST', body: '{}' })
  }

  getRobotState = async <T = unknown>(keys: string[]): Promise<T> => {
    const qs = keys && keys.length > 0 ? `?keys=${encodeURIComponent(keys.join(','))}` : ''
    return await this.request<T>(`/state${qs}`)
  }
}
