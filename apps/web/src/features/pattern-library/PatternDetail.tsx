import { ArrowRight, Lock, Wand2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { PatternDetail as Pattern, PatternLibrarySummary, RoleDefinition } from "../../api/v2";
import { ENGINEER_ROLES, useCan } from "../../app/session";
import { Button, Mono, Panel, StatusBadge } from "../../components/ui/primitives";
import { formatLagWindow, polarityLabel } from "../approvals/diffFormat";
import { MechanismDiagram } from "./MechanismDiagram";
import { SymptomTimeline } from "./SymptomTimeline";
import { humanize, severityLabel, severityStatus } from "./libraryModel";

function RoleChips({ required, optional, roles }: { required: string[]; optional: string[]; roles: RoleDefinition[] }) {
  const defs = new Map(roles.map((r) => [r.role, r]));
  const title = (role: string) => {
    const d = defs.get(role);
    return d ? `${d.quantity}${d.units.length ? ` [${d.units.join(", ")}]` : ""}` : role;
  };
  return (
    <div className="plib-roles">
      <div className="plib-roles__group">
        <span className="plib-roles__label">Required</span>
        {required.map((r) => (
          <span key={r} className="eng-chip eng-chip--req" title={title(r)}>{r}</span>
        ))}
      </div>
      {optional.length ? (
        <div className="plib-roles__group">
          <span className="plib-roles__label">Optional</span>
          {optional.map((r) => (
            <span key={r} className="eng-chip eng-chip--opt" title={title(r)}>{r}</span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function PatternDetailView({
  pattern,
  library,
  roles,
  onApply,
}: {
  pattern: Pattern;
  library: PatternLibrarySummary | undefined;
  roles: RoleDefinition[];
  onApply: () => void;
}) {
  const canApply = useCan(ENGINEER_ROLES);
  return (
    <article className="plib-detail" aria-labelledby="plib-title">
      <header className="plib-detail__head">
        <div className="plib-detail__crumbs">
          <span>{library?.display_name ?? pattern.pattern_id.split(".")[0]}</span>
          <span aria-hidden>/</span>
          <span>{humanize(pattern.category)}</span>
        </div>
        <div className="plib-detail__titlerow">
          <h2 id="plib-title" className="plib-detail__title">{pattern.title}</h2>
          {canApply ? (
            <Button variant="primary" icon={<Wand2 />} onClick={onApply}>
              Apply to asset…
            </Button>
          ) : null}
        </div>
        <div className="plib-detail__meta">
          <StatusBadge status={severityStatus(pattern.severity)} label={severityLabel(pattern.severity)} />
          <Mono className="plib-detail__id">{pattern.pattern_id}@{pattern.version}</Mono>
          <span className="eng-chip">{pattern.category}</span>
          <span className="plib-detail__trigger">
            trigger <Mono>{pattern.trigger_role}</Mono>
          </span>
        </div>
        <RoleChips required={pattern.required_roles} optional={pattern.optional_roles ?? []} roles={roles} />
        {pattern.description ? <p className="plib-detail__desc">{pattern.description}</p> : null}
        {pattern.typical_progression ? (
          <p className="plib-detail__prog">
            <strong>Typical progression.</strong> {pattern.typical_progression}
          </p>
        ) : null}
      </header>

      <Panel title="Symptom timeline" actions={<span className="eng-muted plib-panel-note">onset after trigger · log scale · opacity = weight</span>}>
        <SymptomTimeline symptoms={pattern.symptoms} triggerRole={pattern.trigger_role} />
      </Panel>

      {pattern.mechanism?.nodes?.length ? (
        <Panel title="Mechanism" actions={<span className="eng-muted plib-panel-note">inside the component · hover a loop to trace it</span>}>
          <MechanismDiagram mechanism={pattern.mechanism} />
        </Panel>
      ) : null}

      {pattern.propagation?.length ? (
        <Panel title="Propagation to neighbours" padded={false}>
          <div className="plib-scroll">
            <table className="pl-table plib-prop">
              <thead>
                <tr>
                  <th scope="col">Relation</th>
                  <th scope="col">Effect role</th>
                  <th scope="col">Direction</th>
                  <th scope="col">Polarity</th>
                  <th scope="col">Lag</th>
                  <th scope="col">Edge type</th>
                  <th scope="col">Loop</th>
                </tr>
              </thead>
              <tbody>
                {pattern.propagation.map((p, i) => (
                  <tr key={i}>
                    <td>
                      <Mono>{p.relation}</Mono>
                      {p.note ? <div className="plib-cell-note">{p.note}</div> : null}
                    </td>
                    <td><Mono>{p.effect_role}</Mono></td>
                    <td>{p.direction === "rise" ? "↑ rise" : p.direction === "fall" ? "↓ fall" : p.direction}</td>
                    <td>{polarityLabel(p.polarity)}</td>
                    <td><Mono>{formatLagWindow(p.lag_ms)}</Mono></td>
                    <td><Mono>{p.edge_type}</Mono></td>
                    <td>{p.loop_ok ? <span className="eng-chip">↻ {p.loop_id || "flagged"}</span> : <span className="eng-muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      ) : null}

      <div className="plib-two">
        {pattern.discriminators?.length ? (
          <Panel title="How to tell it apart">
            <ul className="plib-disc">
              {pattern.discriminators.map((d) => (
                <li key={d.vs_pattern}>
                  <div className="plib-disc__vs">
                    vs <Link to={`/eng/library/${encodeURIComponent(d.vs_pattern)}`} className="eng-link pl-mono">{d.vs_pattern}</Link>
                  </div>
                  {d.first_role && d.then_role ? (
                    <div className="plib-disc__order" aria-label={`${d.first_role} first, then ${d.then_role}`}>
                      <span className="plib-disc__step"><small>first</small> <Mono>{d.first_role}</Mono></span>
                      <ArrowRight aria-hidden />
                      <span className="plib-disc__step"><small>then</small> <Mono>{d.then_role}</Mono></span>
                    </div>
                  ) : null}
                  <p>{d.rule}</p>
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}

        <Panel title="Safe checks, in order">
          <ol className="plib-checks">
            {[...pattern.checks].sort((a, b) => a.order - b.order).map((c) => (
              <li key={c.order}>
                <span className="plib-checks__n">{c.order}</span>
                <span className="plib-checks__text">{c.text}</span>
                {c.requires_isolation ? (
                  <span className="plib-iso" title="Requires isolation (lock-out / tag-out) before this check">
                    <Lock aria-hidden /> Requires isolation
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </Panel>
      </div>

      {pattern.signatures?.length ? (
        <Panel title="Signatures">
          <ul className="plib-sigs">
            {pattern.signatures.map((s, i) => (
              <li key={i}>
                <span className="eng-chip">{s.domain.replace(/_/g, " ")}</span>
                <span>{s.description}</span>
                {s.formula ? <code className="plib-formula">{s.formula}</code> : null}
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {pattern.references?.length ? (
        <Panel title="References">
          <ul className="plib-refs">
            {pattern.references.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </Panel>
      ) : null}
    </article>
  );
}
