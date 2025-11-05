import type { Server } from 'node:http'

import type { Logger } from 'homebridge'

import type { IRoombaClient } from './roomba-client/IRoombaClient.js'

import { createServer } from 'node:http'

/**
 * Built-in REST980-compatible server for Roomba control
 * Provides HTTP endpoints compatible with rest980 protocol
 */
export class Rest980Server {
  private server?: Server
  private clients: Map<string, IRoombaClient> = new Map()

  constructor(
    private readonly port: number,
    private readonly log: Logger,
  ) {}

  /**
   * Register a Roomba client with its BLID for REST access
   */
  registerClient(blid: string, client: IRoombaClient): void {
    this.clients.set(blid, client)
    this.log.info(`Registered Roomba ${blid} with REST980 server`)
  }

  /**
   * Start the HTTP server
   */
  start(): void {
    if (this.server) {
      this.log.warn('REST980 server already running')
      return
    }

    this.server = createServer(async (req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*')
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

      if (req.method === 'OPTIONS') {
        res.writeHead(204)
        res.end()
        return
      }

      const url = new URL(req.url || '/', `http://${req.headers.host}`)
      const pathname = url.pathname

      try {
        // Extract BLID from path (e.g., /api/local/info/state or /api/local/action/start)
        // For simplicity, we'll use first registered client if no BLID in path
        const client = this.clients.values().next().value as IRoombaClient | undefined

        if (!client) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'No Roomba clients registered' }))
          return
        }

        // Handle command endpoints (POST)
        if (req.method === 'POST' && pathname.startsWith('/api/local/action/')) {
          const action = pathname.split('/').pop()
          await this.handleCommand(action, client, req, res)
          return
        }

        // Handle state endpoint (GET)
        if (req.method === 'GET' && pathname.includes('/state')) {
          await this.handleState(client, url.searchParams, res)
          return
        }

        // Handle info endpoints
        if (req.method === 'GET' && pathname.includes('/info')) {
          await this.handleInfo(client, res)
          return
        }

        // 404 for unknown paths
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Endpoint not found' }))
      } catch (error: any) {
        this.log.error('REST980 server error:', error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Internal server error' }))
      }
    })

    this.server.listen(this.port, () => {
      this.log.info(`REST980 server listening on port ${this.port}`)
      this.log.info(`Available endpoints:`)
      this.log.info(`  POST http://localhost:${this.port}/api/local/action/start`)
      this.log.info(`  POST http://localhost:${this.port}/api/local/action/stop`)
      this.log.info(`  POST http://localhost:${this.port}/api/local/action/pause`)
      this.log.info(`  POST http://localhost:${this.port}/api/local/action/resume`)
      this.log.info(`  POST http://localhost:${this.port}/api/local/action/dock`)
      this.log.info(`  GET  http://localhost:${this.port}/api/local/info/state`)
    })

    this.server.on('error', (error) => {
      this.log.error('REST980 server error:', error)
    })
  }

  /**
   * Stop the HTTP server
   */
  stop(): void {
    if (this.server) {
      this.server.close()
      this.server = undefined
      this.log.info('REST980 server stopped')
    }
  }

  /**
   * Handle command actions
   */
  private async handleCommand(
    action: string | undefined,
    client: IRoombaClient,
    req: any,
    res: any,
  ): Promise<void> {
    let body = ''
    req.on('data', (chunk: string) => {
      body += chunk.toString()
    })

    req.on('end', async () => {
      try {
        let params: any = {}
        if (body) {
          try {
            params = JSON.parse(body)
          } catch {
            // Ignore parse errors for empty body
          }
        }

        switch (action) {
          case 'start':
          case 'clean':
            await client.clean()
            break
          case 'stop':
            await client.pause() // Stop by pausing
            break
          case 'pause':
            await client.pause()
            break
          case 'resume':
            await client.resume()
            break
          case 'dock':
            await client.dock()
            break
          case 'find':
            if (client.find) {
              await client.find()
            }
            break
          case 'cleanRoom':
            if (params.mission) {
              await client.cleanRoom(params.mission)
            } else {
              throw new Error('Missing mission parameter for cleanRoom')
            }
            break
          default:
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: `Unknown action: ${action}` }))
            return
        }

        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true }))
      } catch (error: any) {
        this.log.error(`Error executing action ${action}:`, error)
        res.writeHead(500, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: error.message || 'Command failed' }))
      }
    })
  }

  /**
   * Handle state queries
   */
  private async handleState(
    client: IRoombaClient,
    searchParams: URLSearchParams,
    res: any,
  ): Promise<void> {
    try {
      const keysParam = searchParams.get('keys')
      const keys = keysParam ? keysParam.split(',') : []
      const state = await client.getRobotState(keys)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state))
    } catch (error: any) {
      this.log.error('Error fetching state:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message || 'Failed to fetch state' }))
    }
  }

  /**
   * Handle info queries (basic robot information)
   */
  private async handleInfo(
    client: IRoombaClient,
    res: any,
  ): Promise<void> {
    try {
      // Fetch basic robot state
      const state = await client.getRobotState([
        'name',
        'sku',
        'softwareVer',
        'batPct',
        'bin',
        'cleanMissionStatus',
      ])

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(state))
    } catch (error: any) {
      this.log.error('Error fetching info:', error)
      res.writeHead(500, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: error.message || 'Failed to fetch info' }))
    }
  }
}
