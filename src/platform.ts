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
import { getRoombas } from './roomba.js'
import { PLATFORM_NAME, PLUGIN_NAME } from './settings.js'
import { getVersion } from './utils.js'

export default class RoombaPlatform implements DynamicPlatformPlugin {
  public readonly matterAccessories: Map<string, SerializedMatterAccessory | MatterAccessory> = new Map()
  private api: API
  private log!: Logging
  private config: RoombaPlatformConfig
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
      await this.registerMatterAccessories()
    })
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
  }

  private async registerMatterAccessories(): Promise<void> {
    const accessories: MatterAccessory[] = []

    const devices: (Robot & DeviceConfig)[] = await this.discoveryMethod()
    const pollIntervalMs = Math.max(0, Math.floor((this.config.idleWatchInterval || 15) * 60_000))

    for (const device of devices) {
      const uuid = this.api.matter.uuid.generate(device.blid)
      if (this.matterAccessories.has(uuid)) {
        this.log.debug(`Accessory for BLID ${device.blid} already restored from cache; skipping new registration.`)
        continue
      }

      const vac = new RoboticVacuumAccessory(this.api, this.log, device, this.config, pollIntervalMs)
      accessories.push(vac.toAccessory())
      this.matterAccessories.set(vac.uuid, vac)
    }

    if (accessories.length > 0) {
      await this.api.matter.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, accessories)
      this.log.info(`✓ Registered ${accessories.length} robot vacuum device(s) (Matter)`)
    } else {
      this.log.info('No Roomba devices to register.')
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
