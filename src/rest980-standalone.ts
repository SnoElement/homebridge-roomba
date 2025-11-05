#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Standalone REST980 Server Runner
 *
 * Run a REST980-compatible server without Homebridge
 * Usage: npm run rest980:server -- --port 3000 --blid YOURBLID --password YOURPASSWORD --ip YOURIP
 */

import process from 'node:process'

import { Rest980Server } from './rest980-server.js'
import { DoritaClient } from './roomba-client/DoritaClient.js'

// Parse command line arguments
const args = process.argv.slice(2)
function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : undefined
}

const port = Number.parseInt(getArg('port') || '3000', 10)
const blid = getArg('blid')
const password = getArg('password')
const ip = getArg('ip')

// Simple console logger
const log = {
  info: (...msg: any[]) => console.log('[INFO]', ...msg),
  warn: (...msg: any[]) => console.warn('[WARN]', ...msg),
  error: (...msg: any[]) => console.error('[ERROR]', ...msg),
  debug: (...msg: any[]) => console.log('[DEBUG]', ...msg),
}

if (!blid || !password || !ip) {
  console.error('Usage: npm run rest980:server -- --port 3000 --blid YOURBLID --password YOURPASSWORD --ip YOURIP')
  console.error('')
  console.error('Required arguments:')
  console.error('  --blid      Roomba BLID (robot username)')
  console.error('  --password  Roomba password')
  console.error('  --ip        Roomba IP address')
  console.error('')
  console.error('Optional arguments:')
  console.error('  --port      Server port (default: 3000)')
  process.exit(1)
}

// Create server
const server = new Rest980Server(port, log as any)

// Register Roomba client
const device = {
  blid,
  robotpwd: password,
  ipaddress: ip,
} as any

const client = new DoritaClient(device, log as any)
server.registerClient(blid, client)

// Start server
server.start()

console.log('')
console.log('REST980 server is running!')
console.log(`Test with: curl http://localhost:${port}/api/local/info/state`)
console.log('')

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...')
  server.stop()
  process.exit(0)
})

process.on('SIGTERM', () => {
  console.log('Shutting down server...')
  server.stop()
  process.exit(0)
})
