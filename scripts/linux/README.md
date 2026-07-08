# Running Copilot Proxy headless on Linux

Run the VS Code Copilot Proxy as a background service on a Linux machine -- no
visible editor window, auto-started at boot, restarted on failure.

## Why it works this way

The proxy's entire value comes from VS Code's `vscode.lm` API, which reaches
GitHub Copilot models. That API only exists inside a **real VS Code extension
host**. So "headless" here does not mean a plain Node process -- it means
running the full VS Code desktop binary under a **virtual X display (Xvfb)**,
supervised by systemd. Copilot loads and authenticates exactly as it does on a
desktop.

```
systemd user service
  └─ run-headless.sh
       └─ xvfb-run  (virtual display :99)
            └─ VS Code (extension host)
                 ├─ GitHub Copilot  → vscode.lm models
                 └─ Copilot Proxy   → HTTP server on 127.0.0.1:8080
```

## Prerequisites

- Linux with `systemd` (user services).
- VS Code installed (`code` on `PATH`, or a known install path).
- `Xvfb`:
  - Debian/Ubuntu: `sudo apt-get install -y xvfb`
  - Fedora/RHEL: `sudo dnf install -y xorg-x11-server-Xvfb`
- The **GitHub Copilot** extension and the **Copilot Proxy** extension installed:

  ```bash
  code --install-extension GitHub.copilot
  code --install-extension GitHub.copilot-chat
  code --install-extension <copilot-proxy>.vsix --force
  ```

## First-time Copilot sign-in (headless)

Copilot needs a GitHub session. On a box with no browser this is a **one-time
manual step**. Pick whichever fits your setup:

1. **Device-flow login in the terminal** (preferred for pure SSH boxes):

   ```bash
   code tunnel user login --provider github
   ```

   This prints a URL and a code; open the URL on any device, enter the code.
   The resulting GitHub session is used by Copilot in the same VS Code profile.

2. **X11 forwarding for one launch** (if you can SSH with a display):

   ```bash
   ssh -X user@host
   code   # sign in to GitHub/Copilot normally, then quit
   ```

3. **Reuse an existing desktop profile**: if you already sign in to Copilot in
   VS Code on this machine, point the service at that profile by leaving
   `COPILOT_PROXY_USER_DATA_DIR` unset (the default profile is reused).

Verify Copilot is authorized (any working `code` session):
`Ctrl+Shift+P → "GitHub Copilot: Status"`.

## Install the service

Run as your normal user (not `sudo`):

```bash
cd scripts/linux
./install-service.sh
```

This copies `run-headless.sh` to `~/.copilot-proxy/`, installs a systemd user
unit, enables **linger** (so it runs at boot without a login session), and
starts it.

## Verify

```bash
systemctl --user status copilot-proxy.service
journalctl --user -u copilot-proxy.service -f
curl http://127.0.0.1:8080/health
curl http://127.0.0.1:8080/v1/models
```

`/health` returns `{"status":"ok","models_available":N}` once Copilot is ready.
If `models_available` is `0`, Copilot is not authenticated yet -- redo the
sign-in step above and `systemctl --user restart copilot-proxy.service`.

## Configuration

The launcher reads these environment variables (set them in the unit via
`systemctl --user edit copilot-proxy.service`, or export before a manual run):

| Variable                      | Default                      | Purpose                                                                                                |
| ----------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `COPILOT_PROXY_PORT`          | `8080`                       | Port used for log hints / health check. Change the actual port in VS Code setting `copilotProxy.port`. |
| `CODE_BINARY`                 | auto-detected                | Path to the VS Code Electron binary.                                                                   |
| `COPILOT_PROXY_WORKSPACE`     | `~/.copilot-proxy/workspace` | Folder VS Code opens.                                                                                  |
| `COPILOT_PROXY_USER_DATA_DIR` | VS Code default              | Isolate the service's profile/auth.                                                                    |
| `COPILOT_PROXY_EXTRA_ARGS`    | (none)                       | Extra args passed to VS Code.                                                                          |

To change the proxy **port**, set `copilotProxy.port` in the profile's
`settings.json`, then restart the service.

## Run without systemd

On non-systemd hosts, run the launcher directly under any supervisor:

```bash
COPILOT_PROXY_PORT=8080 scripts/linux/run-headless.sh
```

(e.g. inside `tmux`, `supervisord`, or a container entrypoint).

## Uninstall

```bash
scripts/linux/uninstall-service.sh
```

## Security note

The proxy binds to localhost and blocks non-localhost origins. `run-headless.sh`
passes `--password-store=basic`, which stores the GitHub/Copilot token in a
plaintext store (no desktop keyring on headless boxes). Keep the machine and the
`~/.config/Code` (or custom data-dir) profile access-controlled accordingly.
