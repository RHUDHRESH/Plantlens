const LEGEND_ITEMS = [
  { marker: "■", label: "Root cause", className: "pl-dag-legend__root" },
  { marker: "+", label: "Supporting", className: "pl-dag-legend__supporting" },
  { marker: "?", label: "Missing", className: "pl-dag-legend__missing" },
  { marker: "!", label: "Contradicted", className: "pl-dag-legend__contradicted" },
  { marker: "○", label: "Projected", className: "pl-dag-legend__projected" },
] as const;

export function DagLegend() {
  return (
    <ul className="pl-dag-legend" aria-label="Graph legend">
      {LEGEND_ITEMS.map((item) => (
        <li key={item.label} className={`pl-dag-legend__item ${item.className}`}>
          <span className="pl-dag-legend__marker" aria-hidden="true">
            {item.marker}
          </span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );
}