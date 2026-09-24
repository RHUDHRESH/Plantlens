#!/usr/bin/env bash
# PlantLens gateway launcher for Linux and macOS. Run it from anywhere:
#
#   apps/gateway/scripts/start-gateway.sh              # first run: setup wizard, then the gateway
#   apps/gateway/scripts/start-gateway.sh --setup      # re-run the wizard (new PC, new device, new token)
#   apps/gateway/scripts/start-gateway.sh --profile uno   # a second device on the same PC
#
# It finds Python 3.12+, creates apps/gateway/.venv, installs the gateway, runs the setup wizard
# when no config exists yet, then runs the gateway and restarts it (with backoff) if it crashes.
# Options: --setup, --profile NAME, --no-restart, --no-install, --help. Anything after `--` is
# passed to the setup wizard (e.g. -- --server http://192.168.1.50:8000 --token XXX --yes).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GW_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
VENV="$GW_DIR/.venv"
VPY="$VENV/bin/python"

SETUP=0
RESTART=1
INSTALL=1
PROFILE="${PLANTLENS_GATEWAY_PROFILE:-}"
WIZARD_ARGS=()

say() { printf '[plantlens] %s\n' "$*"; }
die() { printf '[plantlens] ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --setup) SETUP=1 ;;
    --profile) [[ $# -ge 2 ]] || die "--profile needs a name"; PROFILE="$2"; shift ;;
    --profile=*) PROFILE="${1#*=}" ;;
    --no-restart) RESTART=0 ;;
    --no-install) INSTALL=0 ;;
    -h|--help) sed -n '2,12p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --) shift; WIZARD_ARGS=("$@"); SETUP=1; break ;;
    *) die "unknown option: $1 (see --help)" ;;
  esac
  shift
done

if [[ -n "$PROFILE" ]]; then
  [[ "$PROFILE" =~ ^[A-Za-z0-9][A-Za-z0-9_-]{0,31}$ ]] || die "invalid profile name '$PROFILE' (letters, digits, - and _)"
  export PLANTLENS_GATEWAY_PROFILE="$PROFILE"
fi

# ---------------------------------------------------------------- Python 3.12+
find_python() {
  local cand
  for cand in python3.13 python3.12 python3 python; do
    if command -v "$cand" >/dev/null 2>&1 && \
       "$cand" -c 'import sys; sys.exit(0 if sys.version_info >= (3, 12) else 1)' >/dev/null 2>&1; then
      command -v "$cand"
      return 0
    fi
  done
  return 1
}

if [[ ! -x "$VPY" ]]; then
  PY="$(find_python)" || die "Python 3.12 or newer is required. Install it (Ubuntu: sudo apt install python3.12 python3.12-venv; macOS: brew install python@3.12 or python.org) and re-run."
  say "creating virtual environment in $VENV (using $PY)"
  "$PY" -m venv "$VENV" || die "could not create the venv (Debian/Ubuntu: sudo apt install python3-venv)"
fi

STAMP="$VENV/.plantlens-installed"
if [[ "$INSTALL" -eq 1 ]] && { [[ ! -f "$STAMP" ]] || [[ "$GW_DIR/pyproject.toml" -nt "$STAMP" ]]; }; then
  say "installing the gateway into the venv (first run or updated dependencies)"
  "$VPY" -m pip install --disable-pip-version-check -q --upgrade pip || true
  "$VPY" -m pip install --disable-pip-version-check -q -e "$GW_DIR" || die "pip install failed (network/proxy?)"
  touch "$STAMP"
fi

cd "$GW_DIR"   # tag map and ./.env resolve the same way from any starting directory

CONFIG="$("$VPY" -m gateway.setup_wizard --config-path)"

# ---------------------------------------------------------------- OS hints
if [[ "$(uname -s)" == "Linux" ]]; then
  if [[ "$(id -u)" -ne 0 ]] && ! id -nG 2>/dev/null | tr ' ' '\n' | grep -qxE 'dialout|uucp'; then
    say "hint: your user is not in the 'dialout' group, so serial ports may be refused."
    say "      fix once: sudo usermod -aG dialout \"${USER:-$(id -un)}\"   (then log out and back in)"
  fi
fi

# ---------------------------------------------------------------- setup wizard
if [[ "$SETUP" -eq 1 || ! -f "$CONFIG" ]]; then
  if [[ ! -t 0 && ${#WIZARD_ARGS[@]} -eq 0 ]]; then
    die "no gateway config at $CONFIG and no terminal to ask questions. Run this script once interactively, or pass: -- --yes --server URL --token TOKEN"
  fi
  say "running the setup wizard (config: $CONFIG)"
  "$VPY" -m gateway.setup_wizard ${WIZARD_ARGS[@]+"${WIZARD_ARGS[@]}"} || die "setup did not complete; nothing started"
fi

if [[ "$(uname -s)" == "Linux" ]] && grep -qE "^GATEWAY_SERIAL_MODE=['\"]?line" "$CONFIG" 2>/dev/null; then
  say "hint (Uno in line mode): opening the port can reset the board. Once per boot run"
  say "      stty -F /dev/ttyACM0 -hupcl   (use your device), or fit 10 uF from RESET to GND."
fi

# ---------------------------------------------------------------- run with restart
STOP=0
CHILD=0
on_signal() {
  STOP=1
  if [[ "$CHILD" -ne 0 ]]; then kill -TERM "$CHILD" 2>/dev/null || true; fi
}
trap on_signal INT TERM

HEALTH_PORT="$(sed -nE "s/^HEALTH_PORT=['\"]?([0-9]+).*/\1/p" "$CONFIG" 2>/dev/null | tail -n1)"
say "starting the gateway${PROFILE:+ (profile $PROFILE)}; health: http://localhost:${HEALTH_PORT:-9101}/health ; Ctrl+C to stop"

delay=2
while true; do
  started=$(date +%s)
  "$VPY" -m gateway.main &
  CHILD=$!
  set +e
  wait "$CHILD"; code=$?
  # `wait` returns early when a trapped signal arrives; wait again for the real exit status.
  if [[ "$STOP" -eq 1 ]]; then wait "$CHILD" 2>/dev/null; fi
  set -e
  CHILD=0
  if [[ "$STOP" -eq 1 ]]; then say "stopped"; exit 0; fi
  if [[ "$code" -eq 0 ]]; then say "gateway exited normally"; exit 0; fi
  if [[ "$RESTART" -eq 0 ]]; then die "gateway exited with code $code"; fi
  ran=$(( $(date +%s) - started ))
  if (( ran > 60 )); then delay=2; fi
  say "gateway exited with code $code after ${ran}s; restarting in ${delay}s (Ctrl+C to stop)"
  sleep "$delay" &
  CHILD=$!
  wait "$CHILD" 2>/dev/null || true
  CHILD=0
  if [[ "$STOP" -eq 1 ]]; then say "stopped"; exit 0; fi
  delay=$(( delay * 2 )); if (( delay > 60 )); then delay=60; fi
done
