import type { RobotMission, Roomba } from 'dorita980'
import type { Logger } from 'homebridge'

import type { DeviceConfig } from '../settings.js'
import type { IRoombaClient } from './IRoombaClient.js'

import dorita980 from 'dorita980'

const ROBOT_CIPHERS = ['AES128-SHA256', 'TLS_AES_256_GCM_SHA384']
const CONNECT_TIMEOUT_MILLIS = 60_000

export class DoritaClient implements IRoombaClient {
  private roomba?: Roomba
  private currentCipherIndex = 0
  private _connecting?: Promise<Roomba>

  constructor(private readonly device: DeviceConfig, private readonly log: Logger) {}

  private async connect(attempts = 0): Promise<Roomba> {
    if (this.roomba) {
      return this.roomba
    }
    if (this._connecting) {
      return this._connecting
    }

    this._connecting = new Promise<Roomba>((resolve, reject) => {
      let settled = false

      const roomba = new dorita980.Local(
        this.device.blid,
        this.device.robotpwd || this.device.password,
        this.device.ipaddress || (this.device as any).ip,
        2,
        { ciphers: ROBOT_CIPHERS[this.currentCipherIndex] },
      )

      const timeout = setTimeout(() => {
        if (settled) {
          return
        }
        settled = true
        try {
          roomba.end()
        } catch {
          // ignore
        }
        reject(new Error('Connect timed out'))
      }, CONNECT_TIMEOUT_MILLIS)

      const onError = (err: Error) => {
        roomba.off('error', onError)
        clearTimeout(timeout)
        try {
          roomba.end()
        } catch {
          // ignore
        }
        if (settled) {
          return
        }
        settled = true
        if (err.message.includes('TLS') && attempts < ROBOT_CIPHERS.length) {
          this.currentCipherIndex = (this.currentCipherIndex + 1) % ROBOT_CIPHERS.length
          this.connect(attempts + 1).then(resolve).catch(reject)
        } else {
          reject(err)
        }
      }
      roomba.on('error', onError)

      roomba.on('connect', () => {
        clearTimeout(timeout)
        if (settled) {
          return
        }
        settled = true
        this.roomba = roomba
        resolve(roomba)
      })
    })

    try {
      return await this._connecting
    } finally {
      this._connecting = undefined
    }
  }

  end = (): void => {
    try {
      this.roomba?.end()
    } catch {
      // ignore
    }
    this.roomba = undefined
  }

  clean = async (): Promise<void> => {
    const r = await this.connect()
    await r.clean()
  }

  cleanRoom = async (mission: RobotMission | Record<string, unknown>): Promise<void> => {
    const r = await this.connect()
    await r.cleanRoom(mission as RobotMission)
  }

  pause = async (): Promise<void> => {
    const r = await this.connect()
    await r.pause()
  }

  resume = async (): Promise<void> => {
    const r = await this.connect()
    await r.resume()
  }

  dock = async (): Promise<void> => {
    const r = await this.connect()
    await r.dock()
  }

  find = async (): Promise<void> => {
    const r = await this.connect()
    // Some models may not implement find; guard
    if (typeof (r as any).find === 'function') {
      await (r as any).find()
    }
  }

  getRobotState = async <T = unknown>(keys: string[]): Promise<T> => {
    const r = await this.connect()
    return r.getRobotState(keys) as unknown as T
  }
}
