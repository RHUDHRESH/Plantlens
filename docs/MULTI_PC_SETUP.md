# Running PlantLens across several PCs

This guide is for a plant or bench LAN.
- **One PC is the server:** it runs the API and the web UI.
- **Any other PC or tablet** opens the UI in a browser.
- **The PC with the RS-485 adapter or Arduino** runs the gateway, which sends readings to the
  server over the network. It can be the server itself or a separate PC.

```
 ┌───────────── Server PC ─────────────┐        ┌──── Gateway PC (optional) ────┐
 │  web UI  :8080  ──proxy──▶ API :8000 │◀──────│ gateway :9101                  │
 │  (nginx)          (FastAPI + SQLite) │ HTTP  │  ├─ RS-485 USB adapter (Modbus)│
 └──────────────▲───────────────────────┘ POST  │  └─ Arduino Uno over USB-C     │
                │ http://<server-ip>:8080      └────────────────────────────────┘
      Operator / engineer PCs (any browser)
```

## What you need

| Machine | Needs |
|---------|-------|
| Server | Docker Desktop or Docker Engine (recommended), or Python 3.12 + Node 22 + pnpm 10 to run natively. |
| Browser PCs | A current Chrome, Edge or Firefox. Nothing to install. |
| Gateway PC | Python 3.12+ on Windows, macOS or Linux (the launcher does the rest), or Linux with Docker; plus the USB adapter or Uno. |

**Ports**

| Port | Used for | Must be reachable from |
|------|----------|------------------------|
| 8080/tcp | Web UI. The same port also proxies `/api`, the `/api/ws/runtime` WebSocket and bench sign-in. | Every browser PC |
| 8000/tcp | API. Gateways post readings here. | The gateway PC(s) |
| 9101/tcp | Gateway health and commissioning (`/health`, `/commission/ports`). | Optional, for diagnostics |

**Firewall:**
- **Windows:** allow Docker Desktop or Python through Windows Defender Firewall on a *Private*
  network.
- **Linux:** `sudo ufw allow 8080,8000/tcp`.

**Find the server's IP address:**
- **Windows:** `ipconfig`
- **Linux:** `hostname -I`
- **macOS:** `ipconfig getifaddr en0`

Give the server a fixed IP (a DHCP reservation) so the address doesn't change.

## 1. Get the code (every machine that runs something)

```bash
git clone https://github.com/RHUDHRESH/Plantlens.git
cd Plantlens
git checkout overhaul/plantlens-v2
```

## 2. Start the server

### Option A: Docker (recommended)

```bash
cp deploy/docker/.env.example deploy/docker/.env
# Edit deploy/docker/.env: set PLANTLENS_DEV_JWT_SECRET and GATEWAY_INGEST_TOKEN to long random
# strings, e.g.  python -c "import secrets; print(secrets.token_urlsafe(32))"
docker compose -f deploy/docker/compose.full.yml --env-file deploy/docker/.env up -d --build
```

- **What starts:** the API (database migrations run automatically; data stays in the `apidata`
  volume) and the web UI on port 8080.
- **Check it:** `curl http://localhost:8000/healthz` should return `{"status":"ok"}`.
- **Stop:** `docker compose -f deploy/docker/compose.full.yml --env-file deploy/docker/.env down`.
  Add `-v` only if you also want to erase revisions and the audit ledger.
- **Gateway on this same PC:** if the adapter or Uno is plugged into the server (Linux), set
  `GATEWAY_DEVICE` in `.env` and add `--profile gateway` to the `up` command.

### Option B: Native (no Docker; Windows, macOS or Linux)

```bash
# API
cd apps/api
python -m venv .venv && . .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
export PLANTLENS_ENV=dev PLANTLENS_DEV_JWT_SECRET=<long-random> GATEWAY_INGEST_TOKEN=<long-random>
#   Windows PowerShell:  $env:PLANTLENS_ENV="dev"; $env:PLANTLENS_DEV_JWT_SECRET="..."; $env:GATEWAY_INGEST_TOKEN="..."
alembic upgrade head
uvicorn app.main:app --host 0.0.0.0 --port 8000       # 0.0.0.0 = reachable from other PCs

# Web UI (second terminal, repo root)
pnpm install --frozen-lockfile
pnpm --filter @plantlens/web build
cd apps/web && npx vite preview --host 0.0.0.0 --port 8080   # proxies /api and /internal to :8000
```

For development with hot reload, use `npx vite --host 0.0.0.0` (port 5173) instead of `preview`.

## 3. Open it from other PCs

1. Browse to `http://<server-ip>:8080`.
2. Choose a role from the top-right menu: **Operator**, **Maintenance**, **Engineer**,
   **Administrator** or **Viewer**. Navigation and actions follow the role, and the API enforces
   the same rules.
3. The chips in the top bar should read **Live** (WebSocket connected) and **Bundle r…** (the
   running revision).
4. Theme follows the operating system. Switch between light and the dark control-room theme with
   the sun/moon button; the choice is remembered per PC.

Every PC sees the same live state. Approvals, shelving, acknowledgements and rollbacks made on one
PC show up on the others and are recorded in the audit ledger with the role that made them.

## 4. Connect the hardware (gateway PC)

The gateway only **reads**. It never writes to devices, because only Modbus read function codes
exist in its code. It works on any PC with Python 3.12+, whatever COM port or tty name the RS-485
adapter or Arduino Uno gets.

### Quick start: one command per OS

Get the code on the gateway PC (step 1), plug in the adapter or Uno, then:

| OS | Run |
|----|-----|
| **Windows** | Double-click `apps\gateway\scripts\start-gateway.bat` |
| **Linux** | `apps/gateway/scripts/start-gateway.sh` |
| **macOS** | `apps/gateway/scripts/start-gateway.sh` |

On the first run the launcher:
1. finds Python 3.12+ (`py -3.12` or `python` on Windows, `python3.12`/`python3` elsewhere), creates
   `apps/gateway/.venv` and installs the gateway;
2. starts the **setup wizard**, which
   - lists the serial ports with friendly names (CH340, CP210x, FTDI, Arduino …, serial number,
     current COM/tty) and picks the device automatically if it is the only one recognised,
     otherwise you type its number;
   - proposes the mode: `line` for an Arduino, `modbus` for an RS-485 adapter;
   - asks for the server URL (`http://<server-ip>:8000`) and the ingest token, and **tests
     them**. "REJECTED (401)" means the token doesn't match the server's `GATEWAY_INGEST_TOKEN`;
   - listens to the device for a few seconds (Uno: `#PLANTLENS READY`/`PL1` lines; Modbus: one
     read of the first device) and reports what it saw;
   - saves everything in a per-user config file outside the repository:
     `%APPDATA%\PlantLens\gateway.env` on Windows, `~/.config/plantlens/gateway.env` on Linux
     and macOS (owner-only permissions);
3. runs the gateway and restarts it automatically if it crashes. Ctrl+C stops it.

Afterwards the same command just starts the gateway. Re-run the wizard with `-Setup`
(Windows: `start-gateway.bat -Setup`) or `--setup` (Linux/macOS), for example after the server's
IP or token changes.

**Why the COM number doesn't matter:** the wizard saves the device by its USB serial number
(`sn:…`) or by its adapter type (`VID:PID`), not as `COM5` or `/dev/ttyUSB0`. The gateway finds
it again after a reboot, in a different USB socket, or when Windows assigns a new COM number.
Only when nothing identifies the device (no USB serial number and two identical adapters) is it
tied to the USB socket, and the wizard tells you.

**Two devices on one PC** (for example an RS-485 stick and an Uno): run one gateway per device
with a profile. Each gets its own config, `GATEWAY_ID` and health port (9101, 9102, …):

```text
start-gateway.bat                  |  apps/gateway/scripts/start-gateway.sh
start-gateway.bat -Profile uno     |  apps/gateway/scripts/start-gateway.sh --profile uno
```

**Start at boot:**
- **Windows:** `powershell -ExecutionPolicy Bypass -File apps\gateway\scripts\install-task.ps1`
  registers a Task Scheduler task that starts the gateway when you log on (add `-Profile uno`
  for a profile).
- **Linux:** `apps/gateway/scripts/install-service.sh` installs and starts a systemd service
  (`journalctl -u plantlens-gateway -f` for logs).

**Scripted setup** (no questions, e.g. for many identical bench PCs):
- Windows: `start-gateway.bat -Setup -Server http://192.168.1.50:8000 -Token <token> -Yes`
- Linux/macOS: `apps/gateway/scripts/start-gateway.sh -- --yes --server http://192.168.1.50:8000 --token <token>`

Add `-Port`/`--port` (`COM5`, a list number, `sn:<serial>` or `VID:PID`) and `-Mode`/`--mode`
(`modbus` or `line`) when several devices are plugged in.

**OS-specific notes:**
- **Linux:** run `sudo usermod -aG dialout $USER` once, then log out and back in. The launcher
  reminds you if you're not in the group.
- **Uno on Linux:** opening the port can reset the board. Run
  `stty -F /dev/ttyACM0 -hupcl` once per boot, or fit a 10 µF capacitor from RESET to GND.
  Windows and macOS don't have this problem.
- **Windows drivers:** CH340 clones need the WCH driver. FTDI and CP210x usually install
  automatically.
- **Serial monitor:** close the Arduino IDE serial monitor first. The gateway opens the port
  exclusively.
- **Modbus settings** (baud rate, parity, slave id, register map) are in
  `packages/sample-data/demo-microgrid/tag_map.json`. The Uno must run
  `arduino/uno_plain/plantlens_uno/plantlens_uno.ino`.

**Check it:** `http://<gateway-pc>:9101/health` (9102 … for profiles).
- For a link: `links[0].state` is `connected`.
- For Modbus: `modbus.devices[].good_reads` keeps rising.
- For the Uno: `line.decoder.accepted_lines` keeps rising.

On the server, the tags turn live on **Operate → Trends**. The hardware checklist, including
unplug/replug and wiring faults, is in `apps/gateway/README.md` under "Validate on real hardware".

### Advanced: Linux with Docker

```bash
cp deploy/docker/.env.example deploy/docker/.env
# Set in .env:
#   PLANTLENS_SERVER_URL=http://<server-ip>:8000
#   GATEWAY_INGEST_TOKEN=<same as server>
#   GATEWAY_DEVICE=/dev/serial/by-id/usb-...        (ls -l /dev/serial/by-id/)
#   GATEWAY_SERIAL_MODE=modbus   (or line for the Uno)
docker compose -f deploy/docker/compose.gateway.yml --env-file deploy/docker/.env up -d --build
curl -s http://localhost:9101/health | python3 -m json.tool
```

Docker Desktop on Windows and macOS can't reliably pass USB serial ports to containers, so use the
launcher there.

### Advanced: manual setup with environment variables

The launcher and wizard only write a config file; everything can also be set by hand. Real
environment variables always override the wizard's file.

| Setting | Value |
|---------|-------|
| `API_BASE_URL` | `http://<server-ip>:8000` |
| `GATEWAY_INGEST_TOKEN` | Exactly the same value as on the server |
| `GATEWAY_SERIAL_MODE` | `modbus` (RS-485) or `line` (Uno) |
| `GATEWAY_SERIAL_PORT` | Optional. Auto-detected when exactly one known adapter is plugged in. Otherwise `sn:<serial-number>`, `1A86:7523` (VID:PID), `/dev/serial/by-id/...` or `COM5`. |
| `PLANTLENS_GATEWAY_CONFIG` | Optional. Another location for the wizard's config file. |

```bash
cd apps/gateway
python -m venv .venv && . .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -e .
python -m gateway.setup_wizard --list                  # ports, adapter names, stable selectors
python -m gateway.diagnostics --detect auto            # picks one port, or explains why not
export API_BASE_URL=http://<server-ip>:8000 GATEWAY_INGEST_TOKEN=<same as server> GATEWAY_SERIAL_MODE=modbus
python -m gateway.main
```

Windows PowerShell:

```powershell
$env:API_BASE_URL="http://<server-ip>:8000"
$env:GATEWAY_INGEST_TOKEN="<same as server>"
$env:GATEWAY_SERIAL_MODE="modbus"   # or "line" for the Uno
$env:GATEWAY_SERIAL_PORT="COM5"     # optional; Device Manager -> Ports (COM & LPT)
python -m gateway.main
```

**Several gateways:** give each one its own `GATEWAY_ID` (for example `gw-line-1`, `gw-bench-2`)
and `HEALTH_PORT`, and the same token. Every gateway posts to the same API.

## 5. Security (read before connecting to a real plant network)

**The role menu is for the bench only.** It works only while `PLANTLENS_ENV=dev`: any browser can
then pick any role. For anything beyond a bench:
- set `PLANTLENS_ENV=production`, which disables the bench sign-in;
- configure OIDC (`OIDC_ISSUER`, `OIDC_AUDIENCE`, `OIDC_JWKS_URL`) so roles come from your
  identity provider.

**Always change the secrets.** `PLANTLENS_DEV_JWT_SECRET` and `GATEWAY_INGEST_TOKEN` must be long
random values. The ingest token is the only thing that lets a device post readings.

**Keep it on the plant or bench LAN** behind the site firewall. Never expose ports 8000 or 8080 to
the internet. PlantLens is advisory and read-only, but its screens show live process state.

**Use HTTPS on shared networks.** Put the web container behind your site's reverse proxy or TLS
terminator.

## Troubleshooting

| Symptom | Cause and fix |
|---------|---------------|
| Browser shows "Could not sign in to the PlantLens API" | The API isn't reachable from the web server, or `PLANTLENS_DEV_JWT_SECRET` is unset. Check `docker compose logs api`. |
| Top bar stays **Offline** or **Stale** | The WebSocket is blocked. Serve the UI through the bundled web container or `vite preview`, which proxy `/api/ws/`. With a custom reverse proxy, enable WebSocket upgrade for `/api/ws/`. |
| Other PCs can't open the page | The firewall is blocking the port, the PC is on a different subnet or guest Wi-Fi, or a native run was started without `--host 0.0.0.0`. |
| Gateway logs `401` from `/api/ingest` | `GATEWAY_INGEST_TOKEN` doesn't match the server's. Re-run the launcher with `-Setup`/`--setup`; the wizard tests the token. |
| Gateway: "several serial ports match" | More than one adapter is plugged in. Re-run the wizard and pick the device (it saves `sn:…`), or set `GATEWAY_SERIAL_PORT`. |
| Gateway: "no serial port matches selector" | The saved device isn't plugged in (or is a different unit). Plug it in, or re-run the wizard on this PC. |
| Launcher: "Python 3.12 or newer is required" | Install Python 3.12+ (python.org, `winget install Python.Python.3.12`, `brew install python@3.12`, `apt install python3.12-venv`). |
| Gateway: "could not exclusively lock" | Another program (IDE serial monitor, second gateway) holds the port. |
| Tags go **STALE** | No data within `stale_after_ms`. Check the cable, power, baud rate, slave id, and A/B wiring (see the gateway README). |
| A gateway PC's clock is wrong | Harmless. The server evaluates gateway readings on its own clock. |
