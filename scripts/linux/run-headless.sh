#!/usr/bin/env bash
# Run the VS Code Copilot Proxy headless (no visible window) on Linux.
#
# Launches the full VS Code desktop binary under a virtual X display (Xvfb) so
# the real extension host loads and the `vscode.lm` (GitHub Copilot) API works.
# The extension auto-starts its HTTP proxy on startup (copilotProxy.autoStart),
# so no extra wiring is needed here.
#
# This process stays in the foreground so it can be supervised (e.g. systemd).
#
# Environment overrides:
#   CODE_BINARY                 Path to the VS Code Electron binary (auto-detected if unset)
#   COPILOT_PROXY_WORKSPACE     Folder to open (default: ~/.copilot-proxy/workspace)
#   COPILOT_PROXY_USER_DATA_DIR Custom --user-data-dir (default: VS Code's default profile)
#   COPILOT_PROXY_PORT          Proxy port used for log hints (default: 8080)
#   COPILOT_PROXY_EXTRA_ARGS    Extra space-separated args passed to VS Code

set -euo pipefail

PORT="${COPILOT_PROXY_PORT:-8080}"

log() { printf '[copilot-proxy] %s\n' "$*"; }
err() { printf '[copilot-proxy] ERROR: %s\n' "$*" >&2; }

# --- Locate the VS Code Electron binary -------------------------------------
# We run the real Electron binary (not the `code` CLI wrapper) so the process
# stays in the foreground; the CLI wrapper detaches and returns immediately.
detect_code_binary() {
    if [[ -n "${CODE_BINARY:-}" ]]; then
        printf '%s' "$CODE_BINARY"
        return 0
    fi
    local candidates=(
        /usr/share/code/code
        /usr/share/code-insiders/code-insiders
        /snap/code/current/usr/share/code/code
        /opt/visual-studio-code/code
        /opt/visual-studio-code-insiders/code-insiders
    )
    local c
    for c in "${candidates[@]}"; do
        [[ -x "$c" ]] && { printf '%s' "$c"; return 0; }
    done
    # Fall back to resolving the `code` wrapper's install directory.
    if command -v code >/dev/null 2>&1; then
        local real dir
        real="$(readlink -f "$(command -v code)")"
        dir="$(dirname "$real")"
        [[ -x "$dir/../code" ]] && { printf '%s' "$dir/../code"; return 0; }
    fi
    return 1
}

if ! CODE_BINARY="$(detect_code_binary)"; then
    err "Could not find the VS Code binary. Install VS Code or set CODE_BINARY."
    exit 1
fi
log "Using VS Code binary: $CODE_BINARY"

# --- Check Xvfb --------------------------------------------------------------
if ! command -v xvfb-run >/dev/null 2>&1; then
    err "xvfb-run not found. Install it, e.g.: sudo apt-get install -y xvfb"
    exit 1
fi

# --- Workspace & data dir ----------------------------------------------------
WORKSPACE="${COPILOT_PROXY_WORKSPACE:-$HOME/.copilot-proxy/workspace}"
mkdir -p "$WORKSPACE"

# Flags that matter for headless stability:
#   --disable-workspace-trust  extension activates without a blocking trust prompt
#   --password-store=basic     GitHub/Copilot token persists without a desktop keyring
#   --no-sandbox / --disable-gpu  needed in many headless/container environments
ARGS=(
    --disable-workspace-trust
    --password-store=basic
    --no-sandbox
    --disable-gpu
)

if [[ -n "${COPILOT_PROXY_USER_DATA_DIR:-}" ]]; then
    mkdir -p "$COPILOT_PROXY_USER_DATA_DIR"
    ARGS+=(--user-data-dir "$COPILOT_PROXY_USER_DATA_DIR")
fi

if [[ -n "${COPILOT_PROXY_EXTRA_ARGS:-}" ]]; then
    # Intentional word splitting so callers can pass multiple args.
    # shellcheck disable=SC2206
    ARGS+=(${COPILOT_PROXY_EXTRA_ARGS})
fi

ARGS+=("$WORKSPACE")

log "Starting headless VS Code (proxy expected on http://127.0.0.1:${PORT})"
log "Health check once up:  curl http://127.0.0.1:${PORT}/health"

# xvfb-run provisions a virtual display; the VS Code Electron process runs in
# the foreground and is supervised by whatever launched this script.
exec xvfb-run -a "$CODE_BINARY" "${ARGS[@]}"
