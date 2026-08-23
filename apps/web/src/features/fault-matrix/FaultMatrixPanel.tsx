import { useMemo, type KeyboardEvent } from "react";
import { MatrixHeatCell, type MatrixMatchState } from "../../components/plant";
import { cn } from "@/lib/utils";
import type { FaultMatrix, FaultMatrixScore } from "../../app/schemas/faultMatrix";
import { buildMatrixViewModel, getMatrixCell, shortTagLabel } from "./matrixModel";

export interface FaultMatrixPanelProps {
  scores?: FaultMatrixScore[];
  matrix?: FaultMatrix | null;
  selectedFaultId?: string | null;
  onSelectFault?: (faultId: string) => void;
  className?: string;
}

const LEGEND_MATCHES: Array<{ match: MatrixMatchState; label: string }> = [
  { match: "exact", label: "Exact" },
  { match: "partial", label: "Partial" },
  { match: "contradict", label: "Contradict" },
  { match: "missing", label: "Missing" },
];

function activateOnKey(event: KeyboardEvent, action: () => void): void {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
}

function ConfidenceMeter({ value }: { value: number }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className="mx-auto flex w-[3.25rem] flex-col items-center gap-1" title={`${pct}%`}>
      <div className="h-1 w-full overflow-hidden rounded-sm bg-ink-300/35">
        <div
          className="h-full rounded-sm bg-ink-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="font-mono text-[10px] tabular-nums text-ink-700">{value.toFixed(2)}</span>
    </div>
  );
}

export function FaultMatrixPanel({
  scores = [],
  matrix = null,
  selectedFaultId = null,
  onSelectFault,
  className,
}: FaultMatrixPanelProps) {
  const model = useMemo(() => buildMatrixViewModel(scores, matrix), [scores, matrix]);

  if (!model.rows.length) {
    return (
      <section
        className={cn(
          "flex min-h-[200px] flex-col items-start justify-center gap-1 bg-surface p-4",
          className,
        )}
        aria-label="Fault matrix"
        data-testid="fault-matrix-panel"
      >
        <h2 className="text-sm font-semibold text-ink-900">Fault × signal matrix</h2>
        <p className="max-w-md text-xs text-ink-500 text-pretty">
          Waiting for symptom evidence. When TagFrames score against the authored matrix, match
          cells appear here — exact, partial, contradict, missing.
        </p>
      </section>
    );
  }

  return (
    <section
      className={cn("flex min-h-0 min-w-0 flex-col bg-surface", className)}
      aria-label="Fault matrix"
      data-testid="fault-matrix-panel"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line px-3 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-[0.06em] text-ink-500">
          Fault × signal matrix
        </h2>
        <span className="font-mono text-[10px] uppercase tracking-wide text-ink-500">
          {model.rows.length} faults · {model.tagIds.length} tags
        </span>
      </div>

      <ul
        className="flex flex-wrap items-center gap-3 border-b border-line px-3 py-1.5"
        aria-label="Match state legend"
        data-testid="fault-matrix-legend"
      >
        {LEGEND_MATCHES.map(({ match, label }) => (
          <li key={match} className="flex items-center gap-1.5">
            <MatrixHeatCell match={match} weight={0.85} className="size-3.5 text-[8px]" title={label} />
            <span className="text-[10px] font-medium text-ink-500">{label}</span>
          </li>
        ))}
      </ul>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-max min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-line">
              <th
                scope="col"
                className="sticky left-0 z-20 bg-surface px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-ink-500"
              >
                Fault
              </th>
              {model.tagIds.map((tagId) => (
                <th
                  key={tagId}
                  scope="col"
                  className="sticky top-0 z-10 max-w-[4.25rem] truncate bg-surface px-1 py-2 text-center font-mono text-[9px] font-medium text-ink-500"
                  title={tagId}
                >
                  {shortTagLabel(tagId)}
                </th>
              ))}
              <th
                scope="col"
                className="sticky top-0 z-10 bg-surface px-2 py-2 text-center text-[10px] font-semibold uppercase tracking-wide text-ink-500"
              >
                Conf
              </th>
            </tr>
          </thead>
          <tbody>
            {model.rows.map((row) => {
              const selected = selectedFaultId === row.faultId;
              const select = () => onSelectFault?.(row.faultId);
              return (
                <tr
                  key={row.faultId}
                  className={cn(
                    "border-b border-line/80 transition-colors",
                    selected && "bg-accent-tint",
                    onSelectFault && "cursor-pointer hover:bg-surface-sunken/80",
                  )}
                  data-fault-id={row.faultId}
                  data-selected={selected ? "true" : undefined}
                  tabIndex={onSelectFault ? 0 : undefined}
                  aria-selected={selected}
                  onClick={onSelectFault ? select : undefined}
                  onKeyDown={
                    onSelectFault ? (event) => activateOnKey(event, select) : undefined
                  }
                >
                  <th
                    scope="row"
                    className={cn(
                      "sticky left-0 z-10 max-w-[13rem] bg-surface px-3 py-1.5 text-left",
                      selected && "bg-accent-tint",
                    )}
                  >
                    <button
                      type="button"
                      className="group flex w-full flex-col items-start gap-0.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                      onClick={(event) => {
                        event.stopPropagation();
                        select();
                      }}
                      aria-pressed={selected}
                    >
                      <span className="truncate text-xs font-semibold text-ink-900 group-hover:text-accent">
                        {row.faultName}
                      </span>
                      <span className="font-mono text-[10px] text-ink-500">{row.faultId}</span>
                    </button>
                  </th>
                  {model.tagIds.map((tagId) => {
                    const cell = getMatrixCell(model, row.faultId, tagId);
                    const title =
                      cell.detail ?? `${row.faultName} · ${tagId}: ${cell.match}`;
                    return (
                      <td key={tagId} className="px-0.5 py-1 text-center align-middle">
                        <button
                          type="button"
                          className="inline-flex justify-center rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                          onClick={(event) => {
                            event.stopPropagation();
                            select();
                          }}
                          onKeyDown={(event) => activateOnKey(event, select)}
                          aria-label={`${row.faultName} · ${tagId}: ${cell.match}`}
                          tabIndex={0}
                        >
                          <MatrixHeatCell
                            match={cell.match}
                            weight={cell.weight}
                            title={title}
                            className="size-6"
                          />
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-center align-middle">
                    <ConfidenceMeter value={row.confidence} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
