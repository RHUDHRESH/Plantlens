export function CompilePreviewShell() {
  return (
    <div className="studio-launchpad__compile-preview">
      <h3>Compile preview</h3>
      <p>
        Authored contracts are validated, compiled into the HMI view model, and projected into the
        runtime preview. This shell documents the pipeline only — compile actions are not wired yet.
      </p>
      <ol>
        <li>Authored contracts (plant, tag map, alarm rules, causal graph, action envelope)</li>
        <li>Schema validation</li>
        <li>Compiled HMI view model</li>
        <li>Runtime HMI preview (read-only advisory)</li>
      </ol>
      <div className="studio-launchpad__disabled-actions">
        <button
          type="button"
          className="pl-btn pl-btn--compact studio-launchpad__disabled-action"
          disabled
          title="Validation action will be wired after Studio forms are connected."
        >
          Validate authored bundle
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact studio-launchpad__disabled-action"
          disabled
          title="Validation action will be wired after Studio forms are connected."
        >
          Compile preview
        </button>
      </div>
    </div>
  );
}