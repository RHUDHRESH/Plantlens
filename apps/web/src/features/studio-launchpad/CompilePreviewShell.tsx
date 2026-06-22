import { CompilePreviewWorkbench } from "../hmi-preview/CompilePreviewWorkbench";

interface CompilePreviewShellProps {
  compiledBundle?: unknown;
}

export function CompilePreviewShell({ compiledBundle }: CompilePreviewShellProps) {
  return (
    <div className="studio-launchpad__compile-preview">
      <CompilePreviewWorkbench compiledBundle={compiledBundle} />
    </div>
  );
}