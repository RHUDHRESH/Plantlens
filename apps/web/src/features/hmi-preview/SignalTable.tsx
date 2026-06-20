import type { SignalHMIState } from "../../app/schemas/plantHmi";
import { signalStatusClass } from "./statusStyles";

interface SignalTableProps {
  signals: SignalHMIState[];
}

export function SignalTable({ signals }: SignalTableProps) {
  if (signals.length === 0) {
    return (
      <section className="hmi-signals hmi-signals--empty" aria-label="Signals">
        <h2>Signals</h2>
        <p>No signals in this projection.</p>
      </section>
    );
  }

  return (
    <section className="hmi-signals" aria-label="Signals">
      <h2>Signals</h2>
      <table className="hmi-signals__table">
        <thead>
          <tr>
            <th>Signal</th>
            <th>Asset</th>
            <th>Value</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((signal) => (
            <tr key={signal.signal_id}>
              <td>{signal.name}</td>
              <td data-tabular>{signal.asset_id}</td>
              <td data-tabular>
                {signal.value === null || signal.value === undefined
                  ? "—"
                  : `${String(signal.value)}${signal.unit ? ` ${signal.unit}` : ""}`}
              </td>
              <td>
                <span className={signalStatusClass(signal.status)}>{signal.status}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}