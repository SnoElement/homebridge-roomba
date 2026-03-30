---
"@homebridge-plugins/homebridge-roomba": patch
---

Fix several bugs in the beta-3.0.0 Matter platform implementation:

- Fix Homebridge crash on startup caused by accessing `api.matter` before calling `loadMatterAPI()`
- Fix robot names showing as model identifiers (e.g. "j9", "m611220") in HomeKit instead of the user's friendly names from the iRobot cloud (e.g. "Wall-E 2.0", "SUKK-R"). The `device.info.robotname` field from the local UDP broadcast was incorrectly preferred over `device.name` from the cloud.
- Fix `config.schema.json` Homebridge UI validation errors: removed false `required: true` on optional fields, added missing `name` field to layout, removed duplicate `idleWatchInterval` entry, fixed `rest980.baseUrl` pattern to accept empty string, and added conditional visibility for relevant fields.
- Fix TypeScript errors caused by missing `email` and `password` fields in the `RoombaPlatformConfig` interface.
