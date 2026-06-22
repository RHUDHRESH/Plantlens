export function CompilePreviewShell() {
  return (
    <div className="studio-launchpad__compile-preview">
      <h3>Compile preview</h3>
      <p>
        Forms validation is local only in Prompt 8. Authored contracts are validated, compiled into
        the HMI view model, and projected into the runtime preview. Compile preview is still disabled
        until Prompt 9.
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
          title="Local forms validation runs in the draft editor. Backend compile is not wired yet."
        >
          Validate authored bundle
        </button>
        <button
          type="button"
          className="pl-btn pl-btn--compact studio-launchpad__disabled-action"
          disabled
          title="Compile preview comes after forms validation."
        >
          Compile preview
        </button>
      </div>
    </div>
  );
}