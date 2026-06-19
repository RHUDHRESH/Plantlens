import { useMutation } from "@tanstack/react-query";
import { compileBundle } from "../../api/client";
import type { CompiledBundle } from "../../api/types";
import { PlantMap2D } from "../maps2d/PlantMap2D";
import type { AuthoredBundle, ValidationIssue } from "../../app/store/studio";

interface CompilePreviewProps {
  bundle: AuthoredBundle | null;
  localIssues: ValidationIssue[];
  onResult: (result: {
    ok: boolean;
    compiled?: CompiledBundle;
    issues: ValidationIssue[];
    previousHash?: string | null;
  }) => void;
}

export function CompilePreview({ bundle, localIssues, onResult }: CompilePreviewProps) {
  const mutation = useMutation({
    mutationFn: () => {
      if (!bundle) throw new Error("No bundle");
      return compileBundle(bundle as unknown as Record<string, unknown>);
    },
    onSuccess: (result) => {
      if (result.status === "ok" && result.compiled) {
        onResult({
          ok: true,
          compiled: result.compiled,
          issues: (result.warnings ?? []).map((w) => ({
            severity: "warning",
            message: w.message,
            fix: w.fix ?? "",
            ...(w.code ? { code: w.code } : {}),
          })),
          ...(result.previous_hash !== undefined ? { previousHash: result.previous_hash } : {}),
        });
      } else {
        onResult({
          ok: false,
          issues: (result.errors ?? []).map((e) => ({
            severity: "error",
            message: e.message,
            fix: e.fix ?? "",
            ...(e.code ? { code: e.code } : {}),
          })),
          ...(result.previous_hash !== undefined ? { previousHash: result.previous_hash } : {}),
        });
      }
    },
    onError: () => {
      onResult({
        ok: false,
        issues: [
          {
            severity: "error",
            message: "Compile request failed",
            fix: "Check API auth and bundle validity.",
          },
        ],
      });
    },
  });

  const blocking = localIssues.filter((i) => i.severity !== "warning").length > 0;
  const hmi = mutation.data?.compiled?.hmi_view_model;

  return (
    <section className="compile-preview" aria-label="Compile preview">
      <header>
        <h3>Compile preview</h3>
        <button
          type="button"
          disabled={!bundle || blocking || mutation.isPending}
          onClick={() => mutation.mutate()}
        >
          {mutation.isPending ? "Compiling…" : "Compile"}
        </button>
      </header>
      {mutation.data?.previous_hash && (
        <p className="compile-preview__diff" data-tabular>
          Previous hash: {mutation.data.previous_hash.slice(0, 12)}…
        </p>
      )}
      {mutation.data?.compiled?.content_hash && (
        <p className="compile-preview__diff" data-tabular>
          New hash: {mutation.data.compiled.content_hash.slice(0, 12)}…
        </p>
      )}
      {hmi && mutation.data?.status === "ok" && (
        <div className="compile-preview__map">
          <PlantMap2D
            nodes={hmi.map_2d.nodes}
            edges={hmi.map_2d.edges}
            assetStatus={{}}
            reducedMotion
          />
        </div>
      )}
      {mutation.data?.status === "error" && (
        <p className="compile-preview__fail" role="alert">
          Compile failed — fix validation issues before retrying.
        </p>
      )}
    </section>
  );
}