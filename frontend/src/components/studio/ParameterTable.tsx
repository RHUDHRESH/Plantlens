import type { AssetParameter } from "./studioTypes";
import { ParameterRow } from "./ParameterRow";

interface ParameterTableProps {
  parameters: AssetParameter[];
  draftValues: Record<string, number | string>;
  editable: boolean;
  searchQuery?: string;
  onChange: (key: string, value: number | string) => void;
}

export function ParameterTable({
  parameters,
  draftValues,
  editable,
  searchQuery = "",
  onChange,
}: ParameterTableProps) {
  const visible = parameters.filter((p) => p.visibility !== "hidden");
  const engineerParams = visible.filter((p) => p.visibility === "engineer");
  const readonlyParams = visible.filter((p) => p.visibility === "readonly");
  const q = searchQuery.trim().toLowerCase();

  const matches = (p: AssetParameter) =>
    !q ||
    p.key.toLowerCase().includes(q) ||
    p.label.toLowerCase().includes(q);

  return (
    <div className="pl-studio-param">
      {engineerParams.length > 0 && (
        <section className="pl-studio-param__section">
          <span className="pl-label">Parameters</span>
          <table className="pl-studio-param__table">
            <thead>
              <tr>
                <th scope="col">Parameter</th>
                <th scope="col">Value</th>
                <th scope="col">Unit</th>
              </tr>
            </thead>
            <tbody>
              {engineerParams.filter(matches).map((p) => (
                <ParameterRow
                  key={p.key}
                  parameter={p}
                  value={draftValues[p.key] ?? p.value}
                  editable={editable}
                  highlighted={Boolean(q && matches(p))}
                  onChange={onChange}
                />
              ))}
            </tbody>
          </table>
        </section>
      )}

      {readonlyParams.length > 0 && (
        <section className="pl-studio-param__section pl-studio-param__section--template">
          <span className="pl-label">Template</span>
          <pre className="pl-studio-param__template-block" aria-label="Asset template metadata">
            {readonlyParams.map((p) => (
              <code key={p.key}>
                {p.key}: {String(draftValues[p.key] ?? p.value)}
              </code>
            ))}
          </pre>
        </section>
      )}
    </div>
  );
}