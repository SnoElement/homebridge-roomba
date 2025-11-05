import type { Logging } from 'homebridge'

import { readFileSync } from 'node:fs'

/**
 * Read this plugin's version from package.json and optionally log it.
 * Keeps relative path aligned with compiled output at dist/utils.js.
 */
export function getVersion(log?: Logging): string {
  const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')) as { version: string }
  if (log && typeof log.debug === 'function') {
    log.debug(`Plugin Version: ${version}`)
  }
  return version
}
