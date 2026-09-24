/** Editable medium × medium compatibility grid. Each cell cycles allow → warn → deny. */
import { MEDIUM_LABEL, MEDIUM_SHORT, mediumColor } from "./media";
import { MEDIA, type Medium, type Verdict } from "./types";

const NEXT: Record<Verdict, Verdict> = { allow: "warn", warn: "deny", deny: "allow" };
const GLYPH: Record<Verdict, string> = { allow: "✓", warn: "!", deny: "✕" };
const WORD: Record<Verdict, string> = { allow: "allowed", warn: "allowed with warning", deny: "denied" };

export function cellVerdict(matrix: Partial<Record<Medium, Partial<Record<Medium, Verdict>>>>, from: Medium, to: Medium): Verdict {
  return matrix[from]?.[to] ?? (from === to ? "allow" : "deny");
}

export function cycleVerdict(v: Verdict): Verdict {
  return NEXT[v];
}

export function MatrixGrid({
  matrix,
  onChange,
  disabled,
}: {
  matrix: Partial<Record<Medium, Partial<Record<Medium, Verdict>>>>;
  onChange: (from: Medium, to: Medium, verdict: Verdict) => void;
  disabled?: boolean;
}) {
  return (
    <div className="cr-matrix-wrap">
      <table className="cr-matrix" aria-label="Medium compatibility matrix (rows: source medium, columns: target medium)">
        <thead>
          <tr>
            <th scope="col" className="cr-matrix__corner">
              <span>from ↓ · to →</span>
            </th>
            {MEDIA.map((to) => (
              <th key={to} scope="col" title={MEDIUM_LABEL[to]}>
                <span className="cr-matrix__col" style={{ ["--c" as string]: mediumColor(to) }}>
                  {MEDIUM_SHORT[to]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEDIA.map((from) => (
            <tr key={from}>
              <th scope="row">
                <span className="cr-matrix__row" style={{ ["--c" as string]: mediumColor(from) }}>
                  {MEDIUM_LABEL[from]}
                </span>
              </th>
              {MEDIA.map((to) => {
                const v = cellVerdict(matrix, from, to);
                return (
                  <td key={to}>
                    <button
                      type="button"
                      className="cr-cell"
                      data-verdict={v}
                      data-diagonal={from === to || undefined}
                      disabled={disabled}
                      aria-label={`${MEDIUM_LABEL[from]} to ${MEDIUM_LABEL[to]}: ${WORD[v]}. Activate to change.`}
                      title={`${MEDIUM_LABEL[from]} → ${MEDIUM_LABEL[to]}: ${WORD[v]}`}
                      onClick={() => onChange(from, to, cycleVerdict(v))}
                    >
                      {GLYPH[v]}
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="cr-legend">
        <span data-verdict="allow">✓ allow</span>
        <span data-verdict="warn">! warn (connects with a badge)</span>
        <span data-verdict="deny">✕ deny (never connects)</span>
      </p>
    </div>
  );
}
