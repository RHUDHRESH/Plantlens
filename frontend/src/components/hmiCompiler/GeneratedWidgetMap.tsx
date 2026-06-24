import { useMemo } from "react";
import { useStore } from "../../store/useStore";
import { getWidgetsForScreen } from "./demoHmiCompilerData";

function statusMarker(status: string): string {
  switch (status) {
    case "bound":
      return "✓";
    case "warning":
      return "!";
    case "missing":
      return "×";
    default:
      return "○";
  }
}

function statusClass(status: string): string {
  return `pl-hmi-widget-map__status--${status}`;
}

export function GeneratedWidgetMap() {
  const { selectedGeneratedScreenId } = useStore();

  const widgets = useMemo(
    () => getWidgetsForScreen(selectedGeneratedScreenId),
    [selectedGeneratedScreenId],
  );

  return (
    <section className="pl-hmi-widget-map" aria-label="Generated widget binding map">
      <h3 className="pl-hmi-widget-map__title">Generated widget map</h3>
      <p className="pl-hmi-widget-map__subtitle">
        Model-to-screen traceability — each widget bound to source files.
      </p>

      <div className="pl-hmi-widget-map__table-wrap">
        <table className="pl-hmi-widget-map__table">
          <thead>
            <tr>
              <th scope="col">Widget</th>
              <th scope="col">Bound to</th>
              <th scope="col">Source file</th>
              <th scope="col">Reason</th>
              <th scope="col">Status</th>
            </tr>
          </thead>
          <tbody>
            {widgets.map((w) => (
              <tr key={w.id} className={statusClass(w.status)}>
                <td>{w.widget}</td>
                <td>{w.boundTo}</td>
                <td>
                  <code className="pl-hmi-widget-map__file">{w.sourceFile}</code>
                </td>
                <td>{w.reason}</td>
                <td>
                  <span className="pl-hmi-widget-map__status-marker" aria-hidden="true">
                    {statusMarker(w.status)}
                  </span>
                  <span className="pl-hmi-widget-map__status-text">{w.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="pl-hmi-widget-map__mobile-list" aria-label="Widget bindings">
        {widgets.map((w) => (
          <li key={w.id} className={`pl-hmi-widget-map__mobile-item ${statusClass(w.status)}`}>
            <div className="pl-hmi-widget-map__mobile-row">
              <strong>{w.widget}</strong>
              <span>
                <span aria-hidden="true">{statusMarker(w.status)}</span> {w.status}
              </span>
            </div>
            <div className="pl-hmi-widget-map__mobile-meta">
              <span>{w.boundTo}</span>
              <code>{w.sourceFile}</code>
            </div>
            <p className="pl-hmi-widget-map__mobile-reason">{w.reason}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}