---
"@homebridge-plugins/homebridge-roomba": patch
---

Fix config.schema.json layout: remove duplicate `idleWatchInterval` entry, add missing `accessoryCategory` to device UI layout. Add `email` and `password` to `RoombaPlatformConfig` TypeScript interface to match fields used in `platform.ts`.
