# Linux Headless Background Service - Design

## Goal

Run the Copilot Proxy as a background service on a Linux machine with the same
functionality as the interactive VS Code extension, and without a visible
editor window.

## Constraint

The proxy depends on VS Code's `vscode.lm` API to reach GitHub Copilot models.
That API only exists inside a **real VS Code extension host**. A plain Node
daemon has no `vscode` module and cannot call Copilot. Therefore "headless" must
still run a genuine VS Code extension host.

## Chosen approach

Run the full VS Code **desktop** binary under a **virtual X display (Xvfb)**,
supervised by a **systemd user service**.

```
systemd user service (linger enabled)
  └─ run-headless.sh
       └─ xvfb-run  (virtual display)
            └─ VS Code Electron (extension host)
                 ├─ GitHub Copilot → vscode.lm
                 └─ Copilot Proxy  → 127.0.0.1:8080
```

### Why not alternatives

- **Plain Node daemon / reverse-engineered Copilot**: impossible with `vscode.lm`;
  fragile and breaks on updates. Rejected.
- **`code serve-web` / `code tunnel`**: runs in a server context where Copilot
  Chat auth is finicky. Kept only as the non-systemd fallback note.
- **True Linux service (system-wide, no user session)**: Copilot auth is
  per-user and needs the user's GitHub session; a system service in a bare
  session breaks auth. Use a **user** service with linger instead.

### Key launch flags

| Flag                            | Reason                                                  |
| ------------------------------- | ------------------------------------------------------- |
| `--disable-workspace-trust`     | Extension activates without a blocking trust prompt     |
| `--password-store=basic`        | GitHub/Copilot token persists without a desktop keyring |
| `--no-sandbox`, `--disable-gpu` | Stability in headless/container environments            |

Run the real Electron binary (not the `code` CLI wrapper) so the process stays
in the foreground and can be supervised.

## Auth

Copilot needs a one-time GitHub sign-in, handled manually on headless hosts via
device flow (`code tunnel user login --provider github`), X11-forwarded launch,
or reusing an existing desktop profile. Documented in `scripts/linux/README.md`.

## Out of scope

- Automating the one-time Copilot sign-in on a browser-less host.
- Windows Task Scheduler launcher (covered by the earlier Windows plan).
