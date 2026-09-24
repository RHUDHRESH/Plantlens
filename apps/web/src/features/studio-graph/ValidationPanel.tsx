/** Every rule finding in the assembly (+ backend validate-assembly), click to focus. */
import { CheckCircle2, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import type { PlantAssembly } from "../../app/schemas/plantAssembly";
import { Button, ErrorNotice, PriorityGlyph, SegmentedControl } from "../../components/ui/primitives";
import type { Issue, IssueTarget } from "../connection-rules/types";
import type { StudioActions } from "./canvas/useStudioActions";
import { validateAssembly } from "./componentLibraryApi";
import { selectAssembly, useStudioStore } from "./studioStore";

type ServerFinding = { code: string; message: string; path: string; fix: string };

/** `connections[C001]` → edge C001, `assets[x]` → node x. */
export function targetFromPath(path: string): IssueTarget | null {
  const conn = /connections\[([^\]]+)\]/.exec(path);
  if (conn?.[1]) return { kind: "edge", id: conn[1] };
  const asset = /assets\[([^\]]+)\]/.exec(path);
  if (asset?.[1] && asset[1] !== "?") return { kind: "node", id: asset[1] };
  return null;
}

export function serverIssues(result: { errors: ServerFinding[]; warnings: ServerFinding[] }): Issue[] {
  const map = (f: ServerFinding, severity: "deny" | "warn", i: number): Issue | null => {
    const target = targetFromPath(f.path);
    return target ? { key: `server:${severity}:${i}`, severity, ruleId: `server.${f.code}`, message: f.message, fix: f.fix, target, source: "server" } : null;
  };
  return [
    ...result.errors.map((f, i) => map(f, "deny", i)),
    ...result.warnings.map((f, i) => map(f, "warn", i)),
  ].filter((x): x is Issue => !!x);
}

function targetLabel(t: IssueTarget): string {
  if (t.kind === "edge") return t.id;
  if (t.kind === "port") return `${t.id} · ${t.portId}`;
  return t.id;
}

export function ValidationPanel({ issues, actions }: { issues: readonly Issue[]; actions: Pick<StudioActions, "focusElement"> }) {
  const assembly = useStudioStore(selectAssembly);
  const [filter, setFilter] = useState<"all" | "deny" | "warn">("all");
  const [server, setServer] = useState<{ for: PlantAssembly; issues: Issue[] } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const stale = server && server.for !== assembly;
  const all = useMemo(() => [...issues, ...(server && !stale ? server.issues : [])], [issues, server, stale]);
  const shown = all.filter((i) => filter === "all" || i.severity === filter);
  const deny = all.filter((i) => i.severity === "deny").length;
  const warn = all.length - deny;

  const runServer = async () => {
    setLoading(true);
    setError(null);
    const snapshot = assembly;
    try {
      const result = await validateAssembly(snapshot);
      setServer({ for: snapshot, issues: serverIssues(result) });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="st-validation">
      <div className="st-validation__head">
        <p className="st-validation__counts" aria-live="polite">
          <span data-severity="deny">
            <PriorityGlyph status="critical" size={10} /> {deny} violation{deny === 1 ? "" : "s"}
          </span>
          <span data-severity="warn">
            <PriorityGlyph status="medium" size={10} /> {warn} warning{warn === 1 ? "" : "s"}
          </span>
        </p>
        <SegmentedControl
          label="Filter findings"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All" },
            { value: "deny", label: "Violations" },
            { value: "warn", label: "Warnings" },
          ]}
        />
      </div>
      <div className="st-validation__server">
        <Button size="sm" icon={<RefreshCw />} busy={loading} onClick={() => void runServer()} disabled={!assembly.assets.length}>
          Server check
        </Button>
        <span className="st-muted">
          {server ? (stale ? "Assembly changed since the server check." : `Server: ${server.issues.length} finding${server.issues.length === 1 ? "" : "s"}.`) : "Also run the API's validate-assembly."}
        </span>
      </div>
      {error ? <ErrorNotice error={error} /> : null}
      {shown.length === 0 ? (
        <div className="st-validation__ok" role="status">
          <CheckCircle2 aria-hidden />
          <span>{all.length ? "Nothing in this filter." : "No rule findings. Required ports are connected and every connection passes."}</span>
        </div>
      ) : (
        <ul className="st-validation__list">
          {shown.map((i) => (
            <li key={i.key}>
              <button
                type="button"
                className="st-finding"
                data-severity={i.severity}
                onClick={() => actions.focusElement(i.target.kind === "port" ? { kind: "node", id: i.target.id } : i.target)}
              >
                <PriorityGlyph status={i.severity === "deny" ? "critical" : "medium"} size={11} title={i.severity === "deny" ? "Violation" : "Warning"} />
                <span className="st-finding__body">
                  <span className="st-finding__msg">{i.message}</span>
                  {i.fix ? <span className="st-finding__fix">Fix: {i.fix}</span> : null}
                  <span className="st-finding__meta pl-mono">
                    {targetLabel(i.target)} · {i.source === "server" ? "server" : i.ruleId.replace(/^builtin\./, "")}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
