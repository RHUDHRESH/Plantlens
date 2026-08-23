import { useState } from "react";
import { postAiMessage, type AiResponse } from "../../api/client";
import { ApiError } from "../../api/types";
import type { ProviderState } from "../../components/plant";
import { ProviderBadge } from "../../components/plant";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ScrollArea } from "../../components/ui/scroll-area";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "../../components/ui/sheet";
import { cn } from "@/lib/utils";

export interface CopilotPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerState?: ProviderState;
  providerLabel?: string;
  initialPrompt?: string;
}

/** Hard-refuse when the harness refuses control / hardware asks (advisory-only). */
export function isHardRefuseResponse(response: Pick<AiResponse, "summary" | "answer">): boolean {
  const blob = `${response.summary} ${response.answer}`.toLowerCase();
  return /\brefus/.test(blob) || /\bhardware\b/.test(blob);
}

export function CopilotPanel({
  open,
  onOpenChange,
  providerState = "degraded",
  providerLabel = "Advisor LLM",
  initialPrompt = "",
}: CopilotPanelProps) {
  const [prompt, setPrompt] = useState(initialPrompt);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<AiResponse | null>(null);

  const refused = response ? isHardRefuseResponse(response) : false;

  async function handleSend() {
    const text = prompt.trim();
    if (!text || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await postAiMessage(text);
      setResponse(result.response);
    } catch (err) {
      setResponse(null);
      if (err instanceof ApiError) {
        setError(err.body.fix ?? err.message);
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Advisor request failed.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 p-0 sm:max-w-md"
        data-testid="copilot-panel"
      >
        <SheetHeader className="border-b border-[var(--line)] p-4 pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle>Copilot</SheetTitle>
            <ProviderBadge state={providerState} label={providerLabel} />
          </div>
          <SheetDescription>
            Evidence-bound explain and draft only. PlantLens never writes hardware.
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-4 p-4">
            {error ? (
              <p className="rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] p-3 text-sm text-[var(--ink-700)]" role="alert">
                {error}
              </p>
            ) : null}

            {response ? (
              <div
                className={cn(
                  "flex flex-col gap-3 rounded-md border p-3",
                  refused
                    ? "border-[var(--advisory)]/40 bg-[var(--advisory-tint)]"
                    : "border-[var(--line)] bg-[var(--surface)]",
                )}
                data-testid="copilot-response"
                data-refused={refused ? "true" : "false"}
              >
                {refused ? (
                  <p
                    className="text-xs font-semibold uppercase tracking-wide text-[var(--advisory)]"
                    role="status"
                    data-testid="copilot-refuse-banner"
                  >
                    Request refused — advisory only, no hardware control
                  </p>
                ) : null}

                {response.summary ? (
                  <p className="text-sm font-medium text-[var(--ink-900)]">{response.summary}</p>
                ) : null}

                <p className="whitespace-pre-wrap text-sm text-[var(--ink-700)]">{response.answer}</p>

                {response.evidence_refs.length > 0 ? (
                  <section aria-label="Evidence citations">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
                      Citations
                    </h3>
                    <ul className="flex flex-col gap-1.5">
                      {response.evidence_refs.map((ref) => (
                        <li
                          key={`${ref.ref_type}:${ref.ref_id}`}
                          className="rounded border border-[var(--line)] bg-[var(--surface-sunken)] px-2 py-1.5 text-xs text-[var(--ink-700)]"
                        >
                          <span className="font-medium data-number">
                            {ref.ref_type}:{ref.ref_id}
                          </span>
                          {ref.quote_or_value ? (
                            <span className="mt-0.5 block text-[var(--ink-500)]">{ref.quote_or_value}</span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {response.limitations.length > 0 ? (
                  <section aria-label="Limitations">
                    <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--ink-500)]">
                      Limitations
                    </h3>
                    <ul className="list-disc space-y-1 pl-4 text-xs text-[var(--ink-500)]">
                      {response.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            ) : (
              !loading &&
              !error && (
                <p className="text-sm text-[var(--ink-500)]">
                  Ask why a situation fired, what evidence supports it, or draft an explanation. Answers cite the
                  runtime evidence packet.
                </p>
              )
            )}

            {loading ? (
              <p className="text-sm text-[var(--ink-500)]" role="status" data-testid="copilot-loading">
                Consulting evidence…
              </p>
            ) : null}
          </div>
        </ScrollArea>

        <form
          className="flex flex-col gap-2 border-t border-[var(--line)] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void handleSend();
          }}
        >
          <Label htmlFor="copilot-prompt">Message</Label>
          <Input
            id="copilot-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Why did this situation fire?"
            disabled={loading}
            autoComplete="off"
            data-testid="copilot-input"
          />
          <Button type="submit" disabled={loading || !prompt.trim()} data-testid="copilot-send">
            {loading ? "Sending…" : "Send"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
