/**
 * Connections — every gateway PC that reports to this server: which PC, which port and adapter,
 * link state, data flow and errors. Read-only (R7): nothing here talks to hardware.
 */
import { Cable, ChevronDown, ChevronRight, Monitor, Usb } from "lucide-react";
import { useId, useMemo, useState } from "react";
import { getApiBaseUrl } from "../../api/config";
import { Button, EmptyState, ErrorNotice, Mono, PageHeader, Panel, StatusBadge } from "../../components/ui/primitives";
import { CopyButton } from "../approvals/engUi";
import type { GatewayEntry, GatewayLink, GatewayTag } from "./api";
import { useGateways } from "./api";
import {
  formatAge,
  formatCount,
  formatDuration,
  formatValue,
  GATEWAY_STATUS,
  linkAdapter,
  linkStatus,
  needsAttention,
  qualityStatus,
  secondsSince,
  serverUrl,
  setupCommands,
  summarize,
  vidPid,
} from "./gatewayModel";
import "./connections.css";

const TAGS_PREVIEW = 8;

function modeLabel(mode: string | undefined): string {
  if (mode === "line") return "Arduino line (PL1)";
  if (mode === "modbus" || mode === "modbus_rtu") return "Modbus RTU";
  if (mode === "modbus_tcp") return "Modbus TCP";
  return mode || "—";
}

// ---- Setup -----------------------------------------------------------------------------------

function CommandBlock({ label, command }: { label: string; command: string }) {
  return (
    <div className="gw-cmd">
      <div className="gw-cmd__head">
        <span>{label}</span>
        <CopyButton value={command} label={`Copy ${label} command`} />
      </div>
      <pre className="gw-cmd__code" tabIndex={0} aria-label={`${label} command`}>
        <code>{command}</code>
      </pre>
    </div>
  );
}

function SetupSteps() {
  const url = serverUrl(window.location, getApiBaseUrl());
  const cmds = setupCommands(url);
  return (
    <ol className="gw-steps">
      <li>
        <strong>On the PC with the RS-485 adapter or Arduino</strong>, get the PlantLens code
        (<Mono>git clone</Mono>, branch <Mono>overhaul/plantlens-v2</Mono>) and plug the adapter in.
      </li>
      <li>
        <span className="gw-steps__row">
          <strong>Server address for the gateway:</strong> <Mono className="gw-url">{url}</Mono>
          <CopyButton value={url} label="Copy server address" />
        </span>
      </li>
      <li>
        <strong>Start the gateway</strong> from the repository folder. Use the same ingest token as the server.
        <div className="gw-cmds">
          <CommandBlock label="Windows PowerShell" command={cmds.windows} />
          <CommandBlock label="Linux / macOS" command={cmds.unix} />
        </div>
      </li>
      <li>
        The PC appears here within a few seconds. Several adapters on one PC? Set <Mono>GATEWAY_SERIAL_PORT</Mono>{" "}
        (for example <Mono>COM5</Mono>). Several gateway PCs? Give each its own <Mono>GATEWAY_ID</Mono>. Full guide:{" "}
        <Mono>docs/MULTI_PC_SETUP.md</Mono>.
      </li>
    </ol>
  );
}

// ---- Gateway card pieces ---------------------------------------------------------------------

function PortItem({ link }: { link: GatewayLink }) {
  const st = linkStatus(link.state);
  const adapter = linkAdapter(link);
  const usb = vidPid(link);
  const showSelector = link.selector && link.selector !== "auto" && link.selector !== link.device;
  return (
    <li className={link.state === "connected" ? "gw-port" : "gw-port is-down"}>
      <div className="gw-port__head">
        <Usb className="gw-port__icon" aria-hidden />
        <Mono className="gw-port__name">{link.device || link.selector || "Port not found"}</Mono>
        <span className="gw-port__adapter">{adapter ?? "Unknown adapter"}</span>
        <span className="gw-port__state">
          <StatusBadge status={st.kind} label={st.label} compact />
        </span>
      </div>
      <dl className="gw-port__facts">
        <div><dt>USB ID</dt><dd><Mono>{usb ?? "—"}</Mono></dd></div>
        <div><dt>Serial no.</dt><dd><Mono>{link.serial_number || "—"}</Mono></dd></div>
        <div><dt>Reconnects</dt><dd><Mono>{formatCount(link.reconnect_count)}</Mono></dd></div>
        {showSelector ? <div><dt>Selector</dt><dd><Mono>{link.selector}</Mono></dd></div> : null}
        {link.description && link.description !== adapter ? <div className="gw-port__desc"><dt>Device</dt><dd>{link.description}</dd></div> : null}
      </dl>
      {link.last_error ? (
        <p className="gw-port__err">
          <span className="gw-port__err-label">Last error</span> {link.last_error}
        </p>
      ) : null}
    </li>
  );
}

function Stat({ label, value, unit, warn }: { label: string; value: string; unit?: string; warn?: boolean }) {
  return (
    <div className={warn ? "gw-stat is-warn" : "gw-stat"}>
      <dt>{label}</dt>
      <dd>
        <Mono>{value}</Mono>
        {unit ? <span className="gw-stat__unit">{unit}</span> : null}
      </dd>
    </div>
  );
}

function Counters({ g }: { g: GatewayEntry }) {
  const hb = g.heartbeat;
  if (!hb) return null;
  const c = hb.counters;
  const u = hb.uplink;
  const isLine = hb.mode === "line";
  const uplinkOk = u.last_status == null || (u.last_status >= 200 && u.last_status < 300);
  return (
    <div className="gw-counters">
      <h3 className="gw-h3">Data from the hardware</h3>
      <dl className="gw-stats gw-stats--3" aria-label="Data from the hardware">
        <Stat label="Rate" value={c.frames_per_s.toFixed(1)} unit="frames/s" />
        <Stat label="Frames sent" value={formatCount(c.frames_published)} />
        <Stat label="Stale tags" value={formatCount(c.stale_tags)} warn={c.stale_tags > 0} />
        {isLine ? (
          <>
            <Stat label="Lines accepted" value={formatCount(c.line_accepted)} />
            <Stat label="Lines rejected" value={formatCount(c.line_rejected)} />
            <Stat label="Checksum failures" value={formatCount(c.line_checksum_failures)} />
          </>
        ) : (
          <>
            <Stat label="Modbus requests" value={formatCount(c.modbus_requests)} />
            <Stat label="Timeouts" value={formatCount(c.modbus_timeouts)} />
            <Stat label="CRC errors" value={formatCount(c.modbus_crc_errors)} />
          </>
        )}
      </dl>
      <h3 className="gw-h3">Uplink to this server</h3>
      <dl className="gw-stats gw-stats--4" aria-label="Uplink to this server">
        <Stat label="Queue" value={formatCount(u.queue_depth)} unit="frames" warn={u.queue_depth > 500} />
        <Stat label="Dropped" value={formatCount(u.dropped)} />
        <Stat label="Quarantined" value={formatCount(u.quarantined)} />
        <Stat label="Last HTTP" value={u.last_status == null ? "—" : String(u.last_status)} warn={!uplinkOk} />
      </dl>
      {u.last_error ? <p className="gw-uplink-err">Uplink: {u.last_error}</p> : null}
    </div>
  );
}

function TagRow({ tag, checkedAt }: { tag: GatewayTag; checkedAt: number }) {
  const q = qualityStatus(tag.quality);
  return (
    <tr>
      <td><Mono>{tag.tag_id}</Mono></td>
      <td><Mono className="gw-muted">{tag.asset_id}</Mono></td>
      <td className="gw-num">
        <Mono>{formatValue(tag.value)}</Mono> <span className="gw-unit">{tag.unit}</span>
      </td>
      <td>{q ? <StatusBadge status={q.kind} label={q.label} compact /> : <span className="gw-muted">Good</span>}</td>
      <td className="gw-muted">{formatAge(secondsSince(tag.received_at, checkedAt))}</td>
    </tr>
  );
}

function TagsTable({ g, checkedAt }: { g: GatewayEntry; checkedAt: number }) {
  const [all, setAll] = useState(false);
  const id = useId();
  if (g.tags.length === 0) {
    return <p className="gw-muted gw-none">No tags received from this gateway yet.</p>;
  }
  const shown = all ? g.tags : g.tags.slice(0, TAGS_PREVIEW);
  return (
    <>
      <div className="gw-table-wrap">
        <table className="pl-table gw-table" aria-labelledby={id}>
          <caption id={id} className="gw-sr">Tags from {g.heartbeat?.hostname || g.gateway_id}</caption>
          <thead>
            <tr><th scope="col">Tag</th><th scope="col">Asset</th><th scope="col" className="gw-num">Value</th><th scope="col">Quality</th><th scope="col">Updated</th></tr>
          </thead>
          <tbody>
            {shown.map((t) => <TagRow key={t.tag_id} tag={t} checkedAt={checkedAt} />)}
          </tbody>
        </table>
      </div>
      {g.tags.length > TAGS_PREVIEW ? (
        <Button size="sm" variant="ghost" onClick={() => setAll((v) => !v)} aria-expanded={all}>
          {all ? "Show fewer" : `Show all ${g.tags.length} tags`}
        </Button>
      ) : null}
    </>
  );
}

function GatewayCard({ g, checkedAt }: { g: GatewayEntry; checkedAt: number }) {
  const hb = g.heartbeat;
  const st = GATEWAY_STATUS[g.status];
  const headingId = useId();
  const ips = hb?.ips.length ? hb.ips : g.remote_addr ? [g.remote_addr] : [];
  const uptime = hb?.started_at ? secondsSince(hb.started_at, checkedAt) : null;
  const lastFrame = secondsSince(g.last_frame_at, checkedAt);
  return (
    <section
      className={`pl-panel gw-card gw-card--${g.status}${needsAttention(g) ? " is-attention" : ""}`}
      aria-labelledby={headingId}
    >
      <header className="gw-card__head">
        <Monitor className="gw-card__icon" aria-hidden />
        <div className="gw-card__title">
          <h2 id={headingId}>{hb?.hostname || g.gateway_id}</h2>
          <span className="gw-card__id">
            gateway <Mono>{g.gateway_id}</Mono>
          </span>
        </div>
        <div className="gw-card__status">
          <span title={st.hint}>
            <StatusBadge status={st.kind} label={st.label} />
          </span>
          <span className="gw-muted gw-card__seen">
            {g.heartbeat_age_s == null ? "no heartbeat" : `heartbeat ${formatAge(g.heartbeat_age_s)}`}
          </span>
        </div>
      </header>

      <dl className="gw-facts">
        <div><dt>Computer</dt><dd>{hb?.os || "—"}</dd></div>
        <div><dt>Address</dt><dd><Mono>{ips.join(", ") || "—"}</Mono></dd></div>
        <div><dt>Mode</dt><dd>{modeLabel(hb?.mode)}</dd></div>
        <div><dt>Running for</dt><dd>{formatDuration(uptime)}</dd></div>
        <div><dt>Last data</dt><dd>{formatAge(lastFrame)}</dd></div>
        <div><dt>Version</dt><dd><Mono>{hb?.version || "—"}</Mono></dd></div>
      </dl>

      <div className="gw-card__body">
        <div className="gw-card__col">
          <h3 className="gw-h3">Serial ports</h3>
          {hb && hb.links.length > 0 ? (
            <ul className="gw-ports">
              {hb.links.map((link, i) => <PortItem key={`${link.name ?? ""}-${link.device ?? i}`} link={link} />)}
            </ul>
          ) : (
            <p className="gw-muted gw-none">
              {hb ? "This gateway reports no serial ports (Modbus TCP only, or not started)." : "Port details appear once this gateway sends a heartbeat."}
            </p>
          )}
          <Counters g={g} />
        </div>
        <div className="gw-card__col">
          <h3 className="gw-h3">
            Tags from this gateway{" "}
            <span className="gw-muted">
              ({g.tag_count}
              {g.assets.length ? ` · ${g.assets.length} ${g.assets.length === 1 ? "asset" : "assets"}` : ""})
            </span>
          </h3>
          <TagsTable g={g} checkedAt={checkedAt} />
        </div>
      </div>
    </section>
  );
}

// ---- Page ------------------------------------------------------------------------------------

export function ConnectionsPage() {
  const { data, error, isLoading } = useGateways();
  const [showSetup, setShowSetup] = useState(false);
  const gateways = useMemo(() => data?.gateways ?? [], [data]);
  const counts = summarize(gateways);
  const checkedAt = data ? Date.parse(data.checked_at) : Date.now();
  const setupId = useId();

  return (
    <div className="pl-page gw-page">
      <PageHeader
        title="Connections"
        description="Gateway PCs sending hardware readings to this server, their serial ports and data flow. Read-only: PlantLens never writes to devices."
        meta={
          gateways.length ? (
            <span className="gw-summary" aria-live="polite">
              <span className="pl-chip"><strong>{counts.online}</strong> online</span>
              {counts.stale ? <span className="pl-chip"><strong>{counts.stale}</strong> stale</span> : null}
              {counts.offline ? <span className="pl-chip"><strong>{counts.offline}</strong> offline</span> : null}
              {counts.unknown ? <span className="pl-chip"><strong>{counts.unknown}</strong> without heartbeat</span> : null}
            </span>
          ) : null
        }
        actions={
          gateways.length ? (
            <Button
              icon={showSetup ? <ChevronDown /> : <ChevronRight />}
              onClick={() => setShowSetup((v) => !v)}
              aria-expanded={showSetup}
              aria-controls={setupId}
            >
              Connect another PC
            </Button>
          ) : null
        }
      />

      {error ? <ErrorNotice error={error} /> : null}

      {gateways.length > 0 && showSetup ? (
        <Panel title="Connect another gateway PC" id={setupId}>
          <SetupSteps />
        </Panel>
      ) : null}

      {isLoading ? (
        <p className="gw-muted" role="status">Loading connections…</p>
      ) : gateways.length === 0 && !error ? (
        <Panel>
          <EmptyState icon={<Cable />} title="No gateway PCs connected">
            <p>
              A gateway is a small program that reads your RS-485 adapter or Arduino and sends readings to this server.
              Start one on the PC the hardware is plugged into:
            </p>
          </EmptyState>
          <SetupSteps />
        </Panel>
      ) : (
        <div className="gw-list">
          {gateways.map((g) => <GatewayCard key={g.gateway_id} g={g} checkedAt={checkedAt} />)}
        </div>
      )}
    </div>
  );
}
