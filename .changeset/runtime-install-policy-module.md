---
type: Changed
pr: 3377
---
**Runtime install metadata now lives in one shared policy catalog** - the installer, runtime-home helpers, and SDK query helpers all read the same runtime install policy. Install execution now dispatches through explicit runtime executors, and installed payloads include `get-shit-done/bin/shared/runtime-install-policy.json` to prevent drift between install-time behavior and SDK/runtime discovery.
