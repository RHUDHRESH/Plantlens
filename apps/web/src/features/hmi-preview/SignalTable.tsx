import type { SignalHMIState } from "../../app/schemas/plantHmi";
import { Panel, StatusBadge } from "../../components/ui/primitives";
import { signalStatusKind, statusLabel } from "./statusStyles";

interface SignalTableProps {
  signals: SignalHMIState[];
}

export function SignalTable({ signals }: SignalTableProps) {
  return (
    <Panel title="Signals" aria-label="Signals" className="hmi-card hmi-card--wide" padded={signals.length === 0}>
      {signals.length === 0 ? (
        <p className="hmi-muted">No signals in this projection.</p>
      ) : (
        <div className="hmi-signals__scroll">
          <table className="pl-table">
            <thead>
              <tr>
                <th>Signal</th>
                <th>Asset</th>
                <th className="hmi-num">Value</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {signals.map((signal) => (
                <tr key={signal.signal_id}>
                  <td>{signal.name}</td>
                  <td data-tabular>{signal.asset_id}</td>
                  <td data-tabular className="hmi-num">
                    {signal.value === null || signal.value === undefined
                      ? "—"
                      : `${String(signal.value)}${signal.unit ? ` ${signal.unit}` : ""}`}
                  </td>
                  <td>
                    <StatusBadge compact status={signalStatusKind(signal.status)} label={statusLabel(signal.status)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
