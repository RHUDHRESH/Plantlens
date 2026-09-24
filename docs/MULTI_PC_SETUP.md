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
| Gateway PC | Linux with Docker, or Python 3.12 on Windows, macOS or Linux, plus the USB adapter or Uno. |

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
exist in its code. It needs three settings:

| Setting | Value |
|---------|-------|
| `API_BASE_URL` (or `PLANTLENS_SERVER_URL` with Docker) | `http://<server-ip>:8000` |
| `GATEWAY_INGEST_TOKEN` | Exactly the same value as on the server |
| Serial port | Auto-detected when exactly one known adapter is plugged in. Otherwise set `GATEWAY_SERIAL_PORT`: `COM5`, `/dev/serial/by-id/...`, `1A86:7523` (VID:PID) or `sn:<serial-number>`. |

**Mode** (`GATEWAY_SERIAL_MODE`):
- `modbus` for an RS-485 adapter talking to Modbus RTU devices. Set baud rate, parity, slave id
  and register map in `packages/sample-data/demo-microgrid/tag_map.json`.
- `line` for an Arduino Uno streaming the PlantLens `PL1` text protocol. Flash
  `arduino/uno_plain/plantlens_uno/plantlens_uno.ino`.

### Linux with Docker

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

### Gateway without Docker (Windows, macOS or Linux)

Docker Desktop on Windows and macOS can't reliably pass USB serial ports to containers, so run the
gateway natively there.

```bash
cd apps/gateway
python -m venv .venv && . .venv/bin/activate           # Windows: .venv\Scripts\activate
pip install -e .
python -m gateway.diagnostics --detect auto            # lists adapters and picks one, or explains why not
```

Linux or macOS:

```bash
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

**OS-specific notes:**
- **Linux:** run `sudo usermod -aG dialout $USER` once, then log out and back in.
- **Uno on Linux:** opening the port can reset the board. Run
  `stty -F /dev/ttyACM0 -hupcl` once per boot, or fit a 10 µF capacitor from RESET to GND.
  Windows and macOS don't have this problem.
- **Windows drivers:** CH340 clones need the WCH driver. FTDI and CP210x usually install
  automatically.
- **Serial monitor:** close the Arduino IDE serial monitor first. The gateway opens the port
  exclusively.

**Check it:** `http://<gateway-pc>:9101/health`.
- For a link: `links[0].state` is `connected`.
- For Modbus: `modbus.devices[].good_reads` keeps rising.
- For the Uno: `line.decoder.accepted_lines` keeps rising.

On the server, the tags turn live on **Operate → Trends**. The hardware checklist, including
unplug/replug and wiring faults, is in `apps/gateway/README.md` under "Validate on real hardware".

**Several gateways:** give each one its own `GATEWAY_ID` (for example `gw-line-1`, `gw-bench-2`)
and the same token. Every gateway posts to the same API.

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
| Gateway logs `401` from `/api/ingest` | `GATEWAY_INGEST_TOKEN` doesn't match the server's. |
| Gateway: "several candidate ports" | More than one adapter is plugged in. Set `GATEWAY_SERIAL_PORT`. |
| Gateway: "could not exclusively lock" | Another program (IDE serial monitor, second gateway) holds the port. |
| Tags go **STALE** | No data within `stale_after_ms`. Check the cable, power, baud rate, slave id, and A/B wiring (see the gateway README). |
| A gateway PC's clock is wrong | Harmless. The server evaluates gateway readings on its own clock. |
