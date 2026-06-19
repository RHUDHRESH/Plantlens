import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getAuthoredBundle, issueDevToken } from "../../api/client";
import { setAuthToken } from "../../api/config";
import { useStudioStore, type AuthoredBundle } from "../../app/store/studio";
import { CompilePreview } from "../hmi-preview/CompilePreview";
import { StudioCanvas } from "../studio-graph/StudioCanvas";
import {
  ActionForm,
  AlarmForm,
  AssetForm,
  EdgeForm,
  RoleForm,
  TagForm,
} from "./forms";
import { ValidationPanel } from "./ValidationPanel";
import { validateBundleLocally } from "./validation";
import "../../styles/studio.css";

const STEPS = [
  "Assets",
  "Tags",
  "Alarms",
  "Causal edges",
  "Roles",
  "Actions",
  "Graph",
  "Compile",
] as const;

type Step = (typeof STEPS)[number];

export function StudioFormShell() {
  const [step, setStep] = useState<Step>("Assets");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [authReady, setAuthReady] = useState(false);
  const [compiledPreview, setCompiledPreview] = useState<AuthoredBundle | null>(null);

  const bundle = useStudioStore((s) => s.bundle);
  const setBundle = useStudioStore((s) => s.setBundle);
  const updateAsset = useStudioStore((s) => s.updateAsset);
  const updateTag = useStudioStore((s) => s.updateTag);
  const updateAlarm = useStudioStore((s) => s.updateAlarm);
  const updateEdge = useStudioStore((s) => s.updateEdge);
  const setValidationIssues = useStudioStore((s) => s.setValidationIssues);
  const validationIssues = useStudioStore((s) => s.validationIssues);

  const authoredQuery = useQuery({
    queryKey: ["authored-bundle"],
    queryFn: ({ signal }) => getAuthoredBundle(signal),
    enabled: authReady,
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await issueDevToken("engineer");
        if (!cancelled) {
          setAuthToken(token);
          setAuthReady(true);
        }
      } catch {
        if (!cancelled) setAuthReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authoredQuery.data && !bundle) {
      setBundle(authoredQuery.data as unknown as AuthoredBundle);
    }
  }, [authoredQuery.data, bundle, setBundle]);

  const localIssues = useMemo(
    () => (bundle ? validateBundleLocally(bundle) : []),
    [bundle],
  );

  useEffect(() => {
    setValidationIssues(localIssues);
  }, [localIssues, setValidationIssues]);

  if (!bundle) {
    return (
      <div className="studio-shell">
        <p>{authoredQuery.isLoading ? "Loading authored bundle…" : "No bundle loaded."}</p>
        <Link to="/">← Runtime HMI</Link>
      </div>
    );
  }

  const assets = bundle.plant.assets;
  const tags = bundle.tag_map.tags;
  const alarms = bundle.alarm_rules.rules;
  const edges = bundle.causal_graph.edges;
  const actions = bundle.action_envelope.actions ?? [];

  return (
    <div className="studio-shell">
      <header className="studio-shell__header">
        <h1>Studio — {bundle.plant.name}</h1>
        <Link to="/">Runtime HMI</Link>
      </header>

      <nav className="studio-shell__steps" aria-label="Authoring steps">
        {STEPS.map((s) => (
          <button
            key={s}
            type="button"
            className={step === s ? "active" : undefined}
            onClick={() => setStep(s)}
          >
            {s}
          </button>
        ))}
      </nav>

      <div className="studio-shell__body">
        <div className="studio-shell__form-area">
          {step === "Assets" && assets[selectedIndex] && (
            <>
              <select
                value={selectedIndex}
                onChange={(e) => setSelectedIndex(Number(e.target.value))}
              >
                {assets.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.id}
                  </option>
                ))}
              </select>
              <AssetForm asset={assets[selectedIndex]} onSave={(a) => updateAsset(selectedIndex, a)} />
            </>
          )}
          {step === "Tags" && tags[selectedIndex] && (
            <>
              <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}>
                {tags.map((t, i) => (
                  <option key={t.tag} value={i}>
                    {t.tag}
                  </option>
                ))}
              </select>
              <TagForm tag={tags[selectedIndex]} onSave={(t) => updateTag(selectedIndex, t)} />
            </>
          )}
          {step === "Alarms" && alarms[selectedIndex] && (
            <>
              <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}>
                {alarms.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.id}
                  </option>
                ))}
              </select>
              <AlarmForm rule={alarms[selectedIndex]} onSave={(r) => updateAlarm(selectedIndex, r)} />
            </>
          )}
          {step === "Causal edges" && edges[selectedIndex] && (
            <>
              <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}>
                {edges.map((e, i) => (
                  <option key={e.id} value={i}>
                    {e.id}
                  </option>
                ))}
              </select>
              <EdgeForm edge={edges[selectedIndex]} onSave={(e) => updateEdge(selectedIndex, e)} />
            </>
          )}
          {step === "Roles" && (
            <RoleForm
              roles={bundle.plant.roles ?? []}
              onSave={(roles) =>
                setBundle({ ...bundle, plant: { ...bundle.plant, roles } })
              }
            />
          )}
          {step === "Actions" && actions[selectedIndex] && (
            <>
              <select value={selectedIndex} onChange={(e) => setSelectedIndex(Number(e.target.value))}>
                {actions.map((a, i) => (
                  <option key={a.id} value={i}>
                    {a.id}
                  </option>
                ))}
              </select>
              <ActionForm
                action={actions[selectedIndex]}
                onSave={(action) => {
                  const next = [...actions];
                  next[selectedIndex] = action;
                  setBundle({
                    ...bundle,
                    action_envelope: { actions: next },
                  });
                }}
              />
            </>
          )}
          {step === "Graph" && <StudioCanvas bundle={bundle} />}
          {step === "Compile" && (
            <CompilePreview
              bundle={bundle}
              localIssues={localIssues}
              onResult={(r) => {
                setValidationIssues([...localIssues, ...r.issues]);
                if (r.ok && r.compiled) {
                  setCompiledPreview(bundle);
                }
              }}
            />
          )}
        </div>
        <ValidationPanel issues={[...localIssues, ...validationIssues]} />
      </div>

      <details className="studio-shell__json">
        <summary>Canonical JSON (read-only preview)</summary>
        <pre>{JSON.stringify(bundle, null, 2)}</pre>
      </details>
      {compiledPreview && (
        <p className="studio-shell__saved" role="status">
          Last successful compile used current form state.
        </p>
      )}
    </div>
  );
}