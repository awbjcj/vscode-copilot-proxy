#!/usr/bin/env bash
# Install the VS Code Copilot Proxy as a headless systemd *user* service.
#
# The service runs the full VS Code desktop binary under Xvfb so Copilot's
# `vscode.lm` API works, auto-starts at boot (via linger), and restarts on
# failure. Run as your normal user (NOT with sudo) so the GitHub/Copilot
# session and VS Code profile belong to you.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEST_DIR="$HOME/.copilot-proxy"
UNIT_DIR="$HOME/.config/systemd/user"
UNIT_NAME="copilot-proxy.service"

echo ""
echo "========================================"
echo "  Copilot Proxy - headless service"
echo "========================================"
echo ""

if [[ "$(id -u)" -eq 0 ]]; then
    echo "WARNING: running as root. This installs a *user* service and Copilot"
    echo "auth is per-user; run this as your normal login user instead." >&2
fi

# --- Dependency checks -------------------------------------------------------
if ! command -v xvfb-run >/dev/null 2>&1; then
    echo "ERROR: xvfb-run is required. Install it, e.g.:" >&2
    echo "  Debian/Ubuntu: sudo apt-get install -y xvfb" >&2
    echo "  Fedora/RHEL:   sudo dnf install -y xorg-x11-server-Xvfb" >&2
    exit 1
fi

if ! command -v systemctl >/dev/null 2>&1; then
    echo "ERROR: systemctl not found. This installer targets systemd systems." >&2
    echo "For non-systemd hosts, run scripts/linux/run-headless.sh under your" >&2
    echo "process manager of choice (tmux, supervisord, etc.)." >&2
    exit 1
fi

# --- Install files -----------------------------------------------------------
mkdir -p "$DEST_DIR" "$UNIT_DIR"
install -m 0755 "$SCRIPT_DIR/run-headless.sh" "$DEST_DIR/run-headless.sh"
echo "Installed launcher: $DEST_DIR/run-headless.sh"

sed "s|@RUN_SCRIPT@|$DEST_DIR/run-headless.sh|g" \
    "$SCRIPT_DIR/copilot-proxy.service" > "$UNIT_DIR/$UNIT_NAME"
echo "Installed unit:     $UNIT_DIR/$UNIT_NAME"

# --- Enable & start ----------------------------------------------------------
# Linger lets the user service run at boot without an active login session.
if command -v loginctl >/dev/null 2>&1; then
    loginctl enable-linger "$USER" 2>/dev/null || \
        echo "NOTE: could not enable linger; service will start on next login."
fi

systemctl --user daemon-reload
systemctl --user enable --now "$UNIT_NAME"

echo ""
echo "Service enabled and started."
echo ""
echo "Useful commands:"
echo "  Status:  systemctl --user status $UNIT_NAME"
echo "  Logs:    journalctl --user -u $UNIT_NAME -f"
echo "  Restart: systemctl --user restart $UNIT_NAME"
echo "  Health:  curl http://127.0.0.1:8080/health"
echo ""
echo "First run only: if Copilot is not yet signed in on this machine, see the"
echo "\"First-time Copilot sign-in\" section of scripts/linux/README.md."
echo ""
