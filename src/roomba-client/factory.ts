import type { Logger } from 'homebridge'

import type { DeviceConfig, RoombaPlatformConfig } from '../settings.js'
import type { IRoombaClient } from './IRoombaClient.js'

import { DoritaClient } from './DoritaClient.js'
import { Rest980Client } from './Rest980Client.js'

export function createRoombaClient(device: DeviceConfig, log: Logger, config: RoombaPlatformConfig): IRoombaClient {
  // Future: allow opting into rest980 via config.rest980?.enabled and baseUrl
  const anyConfig = config as any
  if (anyConfig?.rest980?.enabled && typeof anyConfig.rest980.baseUrl === 'string') {
    return new Rest980Client(anyConfig.rest980.baseUrl, log)
  }
  return new DoritaClient(device, log)
}
