import { exec } from 'node:child_process'
import fs from 'node:fs'
import process from 'node:process'

/* Copyright(C) 2023`-2024, donavanbecker (https://github.com/donavanbecker). All rights reserved.
 *
 * server.ts: homebridge-roomba.
 */
import { HomebridgePluginUiServer } from '@homebridge/plugin-ui-utils'

class PluginUiServer extends HomebridgePluginUiServer {
  constructor() {
    super()
    /*
      A native method getCachedAccessories() was introduced in config-ui-x v4.37.0
      The following is for users who have a lower version of config-ui-x
    */
    this.onRequest('getCachedAccessories', () => {
      try {
        const plugin = '@homebridge-plugins/homebridge-roomba'
        const devicesToReturn = []

        // The path and file of the cached accessories
        const accFile = `${this.homebridgeStoragePath}/accessories/cachedAccessories`

        // Check the file exists
        if (fs.existsSync(accFile)) {
          // read the cached accessories file
          const cachedAccessories: any[] = JSON.parse(fs.readFileSync(accFile, 'utf8'))

          cachedAccessories.forEach((accessory: any) => {
            // Check the accessory is from this plugin
            if (accessory.plugin === plugin) {
              // Add the cached accessory to the array
              devicesToReturn.push(accessory.accessory as never)
            }
          })
        }
        // Return the array
        return devicesToReturn
      } catch {
        // Just return an empty accessory list in case of any errors
        return []
      }
    })
    // Expose getRoombaPassword command
    this.onRequest('getRoombaPassword', async (ip: string) => {
      return new Promise((resolve) => {
        exec(`npm run roomba:getpassword ${ip}`, { cwd: process.cwd() }, (error: any, stdout: string, stderr: string) => {
          if (error) {
            resolve(stderr || error.message)
          } else {
            resolve(stdout)
          }
        })
      })
    })
    // Expose getRoombaLastCommand command
    this.onRequest('getRoombaLastCommand', async ({ blid, password, ip }: { blid: string, password: string, ip: string }) => {
      return new Promise((resolve) => {
        exec(`npm run roomba:getlastcommand ${blid} ${password} ${ip}`, { cwd: process.cwd() }, (error: any, stdout: string, stderr: string) => {
          if (error) {
            resolve(stderr || error.message)
          } else {
            resolve(stdout)
          }
        })
      })
    })
    this.ready()
  }
}

function startPluginUiServer(): PluginUiServer {
  return new PluginUiServer()
}

startPluginUiServer()
