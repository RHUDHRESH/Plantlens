#!/usr/bin/env bash
# Install the PlantLens gateway as a systemd service (Linux), so it starts at boot.
#
#   apps/gateway/scripts/install-service.sh                 # plantlens-gateway.service
#   apps/gateway/scripts/install-service.sh --profile uno   # plantlens-gateway-uno.service
#   apps/gateway/scripts/install-service.sh --uninstall [--profile uno]
#
# Run it as the user who ran the setup wizard (it calls sudo for the systemd part). The service
# runs as that user and reads their ~/.config/plantlens/gateway[.NAME].env.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PROFILE=""
UNINSTALL=0
say() { printf '[plantlens] %s\n' "$*"; }
die() { printf '[plantlens] ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) [[ $# -ge 2 ]] || die "--profile needs a name"; PROFILE="$2"; shift ;;
    --profile=*) PROFILE="${1#*=}" ;;
    --uninstall) UNINSTALL=1 ;;
    -h|--help) sed -n '2,9p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) die "unknown option: $1" ;;
  esac
  shift
done

command -v systemctl >/dev/null 2>&1 || die "systemd not found. On macOS use a launchd agent or run start-gateway.sh from a login item."
if [[ -n "$PROFILE" ]]; then
  [[ "$PROFILE" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$ ]] || die "invalid profile name '$PROFILE'"
fi
UNIT="plantlens-gateway${PROFILE:+-$PROFILE}.service"
DEST="/etc/systemd/system/$UNIT"
SUDO=""
[[ "$(id -u)" -eq 0 ]] || SUDO="sudo"

if [[ "$UNINSTALL" -eq 1 ]]; then
  $SUDO systemctl disable --now "$UNIT" 2>/dev/null || true
  $SUDO rm -f "$DEST"
  $SUDO systemctl daemon-reload
  say "removed $UNIT"
  exit 0
fi

[[ -x "$GW_DIR/.venv/bin/python" ]] || die "no venv yet: run $SCRIPT_DIR/start-gateway.sh${PROFILE:+ --profile $PROFILE} --setup first"
export PLANTLENS_GATEWAY_PROFILE="$PROFILE"
CONFIG="$("$GW_DIR/.venv/bin/python" -m gateway.setup_wizard --config-path)"
[[ -f "$CONFIG" ]] || die "no gateway config at $CONFIG: run $SCRIPT_DIR/start-gateway.sh${PROFILE:+ --profile $PROFILE} --setup first"

RUN_USER="$(id -un)"
RUN_HOME="$HOME"
GROUP=""
for g in dialout uucp; do
  if getent group "$g" >/dev/null 2>&1; then GROUP="$g"; break; fi
done

esc() { printf '%s' "$1" | sed -e 's/[\/&|]/\\&/g'; }
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
sed -e "s|@GW_DIR@|$(esc "$GW_DIR")|g" \
    -e "s|@USER@|$(esc "$RUN_USER")|g" \
    -e "s|@HOME@|$(esc "$RUN_HOME")|g" \
    -e "s|@PROFILE@|$(esc "$PROFILE")|g" \
    -e "s|@PROFILE_LABEL@|${PROFILE:+$(esc "$PROFILE") }|g" \
    -e "s|@SERIAL_GROUP@|$GROUP|g" \
    "$SCRIPT_DIR/plantlens-gateway.service" > "$TMP"
if [[ -z "$GROUP" ]]; then sed -i '/^SupplementaryGroups=/d' "$TMP"; fi

$SUDO install -m 0644 "$TMP" "$DEST"
$SUDO systemctl daemon-reload
$SUDO systemctl enable --now "$UNIT"
say "installed and started $UNIT (config: $CONFIG)"
say "logs:   journalctl -u $UNIT -f"
say "status: systemctl status $UNIT"
