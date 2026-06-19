import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  approveAgentDraft,
  listPendingDrafts,
  rejectAgentDraft,
  requestGraphDraft,
} from "../../api/client";

interface AgentConsoleProps {
  onClose: () => void;
}

export function AgentConsole({ onClose }: AgentConsoleProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const pendingQuery = useQuery({
    queryKey: ["agent-drafts-pending"],
    queryFn: ({ signal }) => listPendingDrafts(signal),
    refetchInterval: 5000,
  });

  const draftMutation = useMutation({
    mutationFn: () => requestGraphDraft(prompt),
    onSuccess: () => {
      setPrompt("");
      void queryClient.invalidateQueries({ queryKey: ["agent-drafts-pending"] });
    },
  });

  const approveMutation = useMutation({
    mutationFn: (draftId: string) => approveAgentDraft(draftId),
    onSuccess: () => {
      setSelectedDraftId(null);
      void queryClient.invalidateQueries({ queryKey: ["agent-drafts-pending"] });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: (draftId: string) => rejectAgentDraft(draftId),
    onSuccess: () => {
      setSelectedDraftId(null);
      void queryClient.invalidateQueries({ queryKey: ["agent-drafts-pending"] });
    },
  });

  const drafts = pendingQuery.data?.drafts ?? [];
  const selected = drafts.find((d) => d.draft_id === selectedDraftId) ?? drafts[0];

  return (
    <div className="agent-console" role="dialog" aria-labelledby="agent-console-title">
      <header className="agent-console__header">
        <h2 id="agent-console-title">Agent Console</h2>
        <p className="agent-console__subtitle">Draft-only — human approval required before any write</p>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="agent-console__draft-request">
        <label htmlFor="agent-prompt">Request graph draft</label>
        <textarea
          id="agent-prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the causal edge or rule to propose…"
          rows={3}
        />
        <button type="button" onClick={() => draftMutation.mutate()} disabled={!prompt.trim()}>
          Submit draft request
        </button>
      </section>

      <section className="agent-console__queue" aria-label="Approval queue">
        <h3>Pending drafts ({drafts.length})</h3>
        <ul>
          {drafts.map((draft) => (
            <li key={draft.draft_id}>
              <button type="button" onClick={() => setSelectedDraftId(draft.draft_id)}>
                {draft.draft_type} — {draft.draft_id}
              </button>
            </li>
          ))}
        </ul>
      </section>

      {selected && (
        <section className="agent-console__approval" aria-label="Draft review">
          <h3>Review draft</h3>
          <pre>{JSON.stringify(selected.payload, null, 2)}</pre>
          <div className="agent-console__approval-bar">
            <button type="button" onClick={() => approveMutation.mutate(selected.draft_id)}>
              Approve (human only)
            </button>
            <button type="button" onClick={() => rejectMutation.mutate(selected.draft_id)}>
              Reject
            </button>
          </div>
        </section>
      )}
    </div>
  );
}