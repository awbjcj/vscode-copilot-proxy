#!/usr/bin/env bash
# Remove the Copilot Proxy headless systemd user service.
# Leaves ~/.copilot-proxy (workspace, launcher) intact.

set -euo pipefail

UNIT_NAME="copilot-proxy.service"
UNIT_DIR="$HOME/.config/systemd/user"

systemctl --user disable --now "$UNIT_NAME" 2>/dev/null || true
rm -f "$UNIT_DIR/$UNIT_NAME"
systemctl --user daemon-reload 2>/dev/null || true

echo "Copilot Proxy service removed."
echo "Left in place: $HOME/.copilot-proxy (delete manually if desired)."
