# Linux Headless Background Service - Tasks

## PHASE 1: HEADLESS LAUNCHER - COMPLETE

**Status:** Complete
**Progress:** 4/4 tasks complete (100%)
**Phase Started:** 2026-07-08
**Last Updated:** 2026-07-08
**Phase Completed:** 2026-07-08

- [x] **1.1** `run-headless.sh` - locate VS Code Electron binary, launch under
      `xvfb-run` with headless-stability flags, stay in foreground
- [x] **1.2** Environment overrides (binary path, workspace, user-data-dir, port,
      extra args)
- [x] **1.3** Dependency checks (VS Code binary, `xvfb-run`) with clear errors
- [x] **1.4** Bash syntax validated (`bash -n`)

## PHASE 2: SERVICE MANAGEMENT - COMPLETE

**Status:** Complete
**Progress:** 3/3 tasks complete (100%)
**Phase Started:** 2026-07-08
**Last Updated:** 2026-07-08
**Phase Completed:** 2026-07-08

- [x] **2.1** `copilot-proxy.service` systemd user unit (Restart=on-failure,
      linger-friendly, `WantedBy=default.target`)
- [x] **2.2** `install-service.sh` - install launcher + unit, enable linger,
      enable & start; dependency and root-user guardrails
- [x] **2.3** `uninstall-service.sh` - disable, remove unit, reload

## PHASE 3: DOCUMENTATION - COMPLETE

**Status:** Complete
**Progress:** 2/2 tasks complete (100%)
**Phase Started:** 2026-07-08
**Last Updated:** 2026-07-08
**Phase Completed:** 2026-07-08

- [x] **3.1** `scripts/linux/README.md` - architecture, prerequisites, headless
      Copilot sign-in options, install/verify, config, uninstall, security note
- [x] **3.2** Feature inventory + design doc updated

## Deferred / future

- [ ] Automate one-time Copilot device-flow sign-in on browser-less hosts
- [ ] Optional container image / entrypoint variant
