import type { AssetInstance, PlantConnection } from "../../app/schemas/plantAssembly";
import type { ComponentTemplate } from "./componentLibraryTypes";

interface AssemblyInspectorProps {
  asset: AssetInstance | null;
  connection: PlantConnection | null;
  fromTemplate: ComponentTemplate | undefined;
  toTemplate: ComponentTemplate | undefined;
  compatibilityReason: string | null;
  compatibilityWarnings: string[];
  onToggleApproved: (connectionId: string, approved: boolean) => void;
  onUpdateLag: (connectionId: string, lagMin: number, lagMax: number) => void;
  onUpdateNotes: (connectionId: string, notes: string) => void;
}

export function AssemblyInspector({
  asset,
  connection,
  fromTemplate,
  toTemplate,
  compatibilityReason,
  compatibilityWarnings,
  onToggleApproved,
  onUpdateLag,
  onUpdateNotes,
}: AssemblyInspectorProps) {
  if (!asset && !connection) {
    return (
      <aside className="assembly-inspector">
        <h2>Inspector</h2>
        <p className="assembly-inspector__hint">Select an asset or connection on the canvas.</p>
      </aside>
    );
  }

  if (asset) {
    return (
      <aside className="assembly-inspector">
        <h2>Asset</h2>
        <dl className="assembly-inspector__dl">
          <div><dt>Asset ID</dt><dd>{asset.asset_id}</dd></div>
          <div><dt>Component</dt><dd>{asset.component_type_id}</dd></div>
          <div><dt>Name</dt><dd>{asset.display_name}</dd></div>
          <div><dt>Ports</dt><dd>{asset.configured_ports.length}</dd></div>
          <div><dt>Signals</dt><dd>{asset.configured_signals.length}</dd></div>
        </dl>
      </aside>
    );
  }

  if (!connection) return null;

  const fromPort = fromTemplate?.ports.find((p) => p.port_id === connection.from_port_id);
  const toPort = toTemplate?.ports.find((p) => p.port_id === connection.to_port_id);

  return (
    <aside className="assembly-inspector">
      <h2>Connection</h2>
      <dl className="assembly-inspector__dl">
        <div><dt>ID</dt><dd>{connection.connection_id}</dd></div>
        <div><dt>From</dt><dd>{connection.from_asset_id}.{connection.from_port_id}</dd></div>
        <div><dt>To</dt><dd>{connection.to_asset_id}.{connection.to_port_id}</dd></div>
        <div><dt>Kind</dt><dd>{connection.connection_kind}</dd></div>
        <div><dt>From medium</dt><dd>{fromPort?.medium ?? "—"}</dd></div>
        <div><dt>To medium</dt><dd>{toPort?.medium ?? "—"}</dd></div>
      </dl>
      {compatibilityReason ? (
        <p className="assembly-inspector__reason">{compatibilityReason}</p>
      ) : null}
      {compatibilityWarnings.length > 0 ? (
        <ul className="assembly-inspector__warnings">
          {compatibilityWarnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}
      <label className="assembly-inspector__field">
        <input
          type="checkbox"
          checked={connection.approved}
          onChange={(e) => onToggleApproved(connection.connection_id, e.target.checked)}
        />
        Approved (assembly state only)
      </label>
      <label className="assembly-inspector__field">
        Lag min (ms)
        <input
          type="number"
          min={0}
          value={connection.lag_min_ms}
          onChange={(e) =>
            onUpdateLag(connection.connection_id, Number(e.target.value), connection.lag_max_ms)
          }
        />
      </label>
      <label className="assembly-inspector__field">
        Lag max (ms)
        <input
          type="number"
          min={0}
          value={connection.lag_max_ms}
          onChange={(e) =>
            onUpdateLag(connection.connection_id, connection.lag_min_ms, Number(e.target.value))
          }
        />
      </label>
      <label className="assembly-inspector__field">
        Notes
        <textarea
          value={connection.notes ?? ""}
          onChange={(e) => onUpdateNotes(connection.connection_id, e.target.value)}
          rows={3}
        />
      </label>
    </aside>
  );
}