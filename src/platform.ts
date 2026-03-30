import type {
  API,
  DynamicPlatformPlugin,
  Logging,
  MatterAccessory,
  PlatformConfig,
  SerializedMatterAccessory,
} from 'homebridge'

import type { DeviceInfo, Robot } from './roomba.js'
import type { DeviceConfig, RoombaPlatformConfig } from './settings.js'

import { RoboticVacuumAccessory } from './devices/index.js'
import { Rest980Server } from './rest980-server.js'
import { createRoombaClient } from './roomba-client/factory.js'
import { getRoombas } from './roomba.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { getVersion } from './utils.js'

export default class RoombaPlatform implements DynamicPlatformPlugin {
  public readonly matterAccessories: Map<string, SerializedMatterAccessory | MatterAccessory> = new Map()
  private api: API
  private log!: Logging
  private config: RoombaPlatformConfig
  private rest980Server?: Rest980Server
  private deviceConfigs: DeviceConfig[] = []
  version!: string

  public constructor(log: Logging, config: PlatformConfig, api: API) {
    this.api = api
    this.config = config as RoombaPlatformConfig
    const debug = !!this.config.debug

    try {
      this.verifyConfig()
      log.debug('Configuration:', JSON.stringify(this.config, null, 2))
    } catch (e: any) {
      log.error('Error in configuration:', e.message ?? e)
      return
    }

    this.log = !debug
      ? log
      : Object.assign(log, { debug: (message: string, ...parameters: unknown[]) => { log.info(`DEBUG: ${message}`, ...parameters) } })

    this.version = getVersion(this.log)

    if (!this.api.isMatterAvailable?.()) {
      this.log.warn('Matter is not available in this version of Homebridge. Please update Homebridge to use this plugin.')
    }
    if (!this.api.isMatterEnabled?.()) {
      this.log.warn('Matter is not enabled in Homebridge. Enable Matter in Homebridge settings to use this plugin.')
      // Proceed anyway; registration will be no-op if Matter is disabled
    }

    this.api.on('didFinishLaunching', async () => {
      try {
        // Pre-load Matter API before accessing it (method may not be in types but exists at runtime)
        const apiWithMatter = this.api as any
        if (apiWithMatter.loadMatterAPI) {
          await apiWithMatter.loadMatterAPI()
        }
        await this.registerMatterAccessories()
        this.startRest980Server()
      } catch (e: any) {
        this.log.error('Error during platform initialization:', e.message ?? e)
        this.log.error('Stack trace:', e.stack)
        throw e
      }
    })
  }

  private startRest980Server(): void {
    if (this.config.rest980Server?.enabled) {
      const port = this.config.rest980Server.port || 3000
      this.rest980Server = new Rest980Server(port, this.log)

      // Register all Roomba clients with the server
      for (const device of this.deviceConfigs) {
        const client = createRoombaClient(device, this.log, this.config)
        this.rest980Server.registerClient(device.blid, client)
      }

      this.rest980Server.start()
      this.log.info(`✓ REST980 server started on port ${port}`)
    }
  }

  private verifyConfig() {
    if (this.config.disableDiscovery === undefined) {
      this.config.disableDiscovery = false
    }
  }

  // Not used for Matter; required by interface
  public configureAccessory(): void {
    // no-op
  }

  public configureMatterAccessory(accessory: SerializedMatterAccessory): void {
    this.log.debug('Loading cached Matter accessory:', accessory.displayName)
    this.matterAccessories.set(accessory.uuid, accessory)
  }

  private async discoveryMethod(): Promise<DeviceConfig[]> {
    try {
      if (this.config.email && this.config.password) {
        const robots: Robot[] = await getRoombas(this.config.email, this.config.password, this.log, this.config)
        return robots.map((robot) => {
          const deviceConfig = this.config.devices?.find(device => device.blid === robot.blid) || {}
          return {
            ...robot,
            ...deviceConfig,
          } as any
        })
      } else if (this.config.devices) {
        return this.config.devices.map(device => ({
          ...device,
        }))
      } else {
        this.log.error('No configuration provided for devices.')
        return []
      }
    } catch (e: any) {
      this.log.error('Error in discoveryMethod:', e.message ?? e)
      this.log.error('Stack trace:', e.stack)
      return []
    }
  }

  private async registerMatterAccessories(): Promise<void> {
    try {
      const accessoriesToRegister: MatterAccessory[] = []
      const accessoriesToUpdate: MatterAccessory[] = []
      const discoveredUuids: Set<string> = new Set()

      const devices: (Robot & DeviceConfig)[] = await this.discoveryMethod()
      this.deviceConfigs = devices
      const pollIntervalMs = Math.max(0, Math.floor((this.config.idleWatchInterval || 15) * 60_000))

      for (const device of devices) {
        try {
          const uuid = this.api.matter.uuid.generate(device.blid)
          discoveredUuids.add(uuid)

          const vac = new RoboticVacuumAccessory(this.api, this.log, device, this.config, pollIntervalMs)
          const accessory = vac.toAccessory()

          if (this.matterAccessories.has(uuid)) {
            // Cached accessory exists: refresh metadata (name/model/context/clusters) to avoid stale values.
            accessoriesToUpdate.push(accessory)
            this.log.debug(`Accessory for BLID ${device.blid} restored from cache; updating metadata.`)
          } else {
            accessoriesToRegister.push(accessory)
          }

          this.matterAccessories.set(vac.uuid, vac)
        } catch (e: any) {
          this.log.error(`Error creating accessory for device ${device.name}:`, e.message ?? e)
          this.log.error('Stack trace:', e.stack)
        }
      }

      // Remove stale accessories that are cached but no longer discovered.
      const staleAccessories: MatterAccessory[] = []
      for (const [uuid, cached] of this.matterAccessories.entries()) {
        if (!discoveredUuids.has(uuid)) {
          staleAccessories.push(cached as MatterAccessory)
          this.matterAccessories.delete(uuid)
        }
      }

      if (staleAccessories.length > 0) {
        await this.api.matter.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, staleAccessories)
        this.log.info(`✓ Unregistered ${staleAccessories.length} stale robot vacuum device(s) (Matter)`)
      }

      if (accessoriesToRegister.length > 0) {
        await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessoriesToRegister)
        this.log.info(`✓ Registered ${accessoriesToRegister.length} robot vacuum device(s) (Matter)`)
      }

      if (accessoriesToUpdate.length > 0) {
        await this.api.matter.updatePlatformAccessories(accessoriesToUpdate)
        this.log.info(`✓ Updated ${accessoriesToUpdate.length} cached robot vacuum device(s) (Matter)`)
      }

      if (accessoriesToRegister.length === 0 && accessoriesToUpdate.length === 0 && staleAccessories.length === 0) {
        this.log.info('No Roomba devices to register or update.')
      }
    } catch (e: any) {
      this.log.error('Error in registerMatterAccessories:', e.message ?? e)
      this.log.error('Stack trace:', e.stack)
      throw e
    }
  }

  private serialNum(device: Robot & DeviceConfig) {
    let deviceInfo: DeviceInfo | undefined
    let serialNumber: string
    const serialNum = device.ipaddress ?? device.ip
    if (device.info) {
      deviceInfo = device.info
      if (device.info.serialNum) {
        serialNumber = device.info.serialNum
        return { serialNumber, deviceInfo }
      } else {
        serialNumber = serialNum
        return { serialNumber, deviceInfo }
      }
    } else {
      deviceInfo = undefined
      serialNumber = serialNum
      return { serialNumber, deviceInfo }
    }
  }
}
