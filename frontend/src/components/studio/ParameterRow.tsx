import type { AssetParameter } from "./studioTypes";

interface ParameterRowProps {
  parameter: AssetParameter;
  value: number | string;
  editable: boolean;
  highlighted?: boolean;
  onChange: (key: string, value: number | string) => void;
}

export function ParameterRow({
  parameter,
  value,
  editable,
  highlighted = false,
  onChange,
}: ParameterRowProps) {
  if (parameter.visibility === "hidden") return null;

  const isReadonly = parameter.visibility === "readonly" || !editable;
  const displayValue = value ?? parameter.value;

  return (
    <tr className={`pl-studio-param__row ${highlighted ? "pl-studio-param__row--highlight" : ""}`}>
      <th scope="row" className="pl-studio-param__name">
        <label htmlFor={`param-${parameter.key}`}>{parameter.label}</label>
      </th>
      <td className="pl-studio-param__value">
        {isReadonly ? (
          <span id={`param-${parameter.key}`} className="pl-studio-param__readonly">
            {displayValue}
          </span>
        ) : (
          <input
            id={`param-${parameter.key}`}
            type="number"
            className="pl-studio-param__input"
            value={displayValue}
            min={parameter.min}
            max={parameter.max}
            step="any"
            onChange={(e) => {
              const raw = e.target.value;
              const num = parseFloat(raw);
              onChange(parameter.key, Number.isFinite(num) ? num : raw);
            }}
            aria-describedby={parameter.description ? `desc-${parameter.key}` : undefined}
          />
        )}
      </td>
      <td className="pl-studio-param__unit">{parameter.unit ?? "—"}</td>
    </tr>
  );
}