import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addIncidentComment,
  completeChecklistItem,
  getIncidentRoom,
  updateIncidentStatus,
} from "../../api/client";

interface IncidentRoomProps {
  incidentId: string;
  onClose: () => void;
}

export function IncidentRoom({ incidentId, onClose }: IncidentRoomProps) {
  const queryClient = useQueryClient();
  const [note, setNote] = useState("");
  const [detailsOpen, setDetailsOpen] = useState(false);

  const roomQuery = useQuery({
    queryKey: ["incident-room", incidentId],
    queryFn: ({ signal }) => getIncidentRoom(incidentId, signal),
    refetchInterval: 3000,
  });

  const commentMutation = useMutation({
    mutationFn: (message: string) => addIncidentComment(incidentId, message),
    onSuccess: () => {
      setNote("");
      void queryClient.invalidateQueries({ queryKey: ["incident-room", incidentId] });
    },
  });

  const checklistMutation = useMutation({
    mutationFn: (itemId: string) => completeChecklistItem(incidentId, itemId),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["incident-room", incidentId] }),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateIncidentStatus(incidentId, status),
    onSuccess: () =>
      void queryClient.invalidateQueries({ queryKey: ["incident-room", incidentId] }),
  });

  const room = roomQuery.data;
  if (roomQuery.isLoading) {
    return <div className="incident-room incident-room--loading">Loading incident room…</div>;
  }
  if (!room) {
    return <div className="incident-room incident-room--error">Incident not found.</div>;
  }

  const blockers = room.checklist.filter((item) => item.status === "pending").slice(0, 2);

  return (
    <div className="incident-room" role="dialog" aria-labelledby="incident-title">
      <header className="incident-room__header">
        <div>
          <h2 id="incident-title">{room.title}</h2>
          <p className="incident-room__meta" data-tabular>
            {room.incident_id} · {room.severity} · {room.status}
          </p>
        </div>
        <button type="button" className="incident-room__close" onClick={onClose}>
          Close
        </button>
      </header>

      <section className="incident-room__primary" aria-label="Root and live state">
        <div className="incident-room__root">
          <h3>Root asset</h3>
          <p>
            <strong>{room.root_asset.name}</strong> ({room.root_asset.asset_id})
          </p>
          <p className={room.live_state?.still_active ? "incident-active" : "incident-clear"}>
            {room.live_state?.still_active ? "Fault still active" : "Fault cleared"}
            {room.live_state && (
              <span data-tabular> — {room.live_state.active_alarm_count} related alarms</span>
            )}
          </p>
        </div>

        {blockers.length > 0 && (
          <div className="incident-room__blockers">
            <h3>Unresolved blockers</h3>
            <ul>
              {blockers.map((item) => (
                <li key={item.id}>{item.label}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <section className="incident-room__evidence" aria-label="Evidence bundle">
        <h3>Evidence</h3>
        <p>{String((room.calm_card as { title?: string } | undefined)?.title ?? "Escalated from Calm Card")}</p>
        <p data-tabular>{room.evidence_bundle?.raw_alarms?.length ?? 0} raw alarms captured</p>
        <button type="button" onClick={() => setDetailsOpen((v) => !v)}>
          {detailsOpen ? "Hide" : "Show"} evidence details
        </button>
        {detailsOpen && (
          <pre className="incident-room__evidence-json">
            {JSON.stringify(room.evidence_bundle, null, 2)}
          </pre>
        )}
      </section>

      <section className="incident-room__checklist" aria-label="Response checklist">
        <h3>Checklist</h3>
        <ul>
          {room.checklist.map((item) => (
            <li key={item.id}>
              <span>{item.label}</span>
              <span data-tabular>{item.status}</span>
              {item.status === "pending" && (
                <button type="button" onClick={() => checklistMutation.mutate(item.id)}>
                  Mark done
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="incident-room__timeline" aria-label="Append-only timeline">
        <h3>Timeline</h3>
        <ol>
          {room.timeline.map((item) => (
            <li key={item.id}>
              <time data-tabular>{item.timestamp}</time> — {item.actor}: {item.message}
            </li>
          ))}
        </ol>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (note.trim()) commentMutation.mutate(note.trim());
          }}
        >
          <label htmlFor="incident-note">Add note</label>
          <textarea id="incident-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} />
          <button type="submit" disabled={!note.trim()}>
            Append note
          </button>
        </form>
      </section>

      <footer className="incident-room__actions">
        <button type="button" onClick={() => statusMutation.mutate("in_progress")}>
          Acknowledge
        </button>
      </footer>
    </div>
  );
}