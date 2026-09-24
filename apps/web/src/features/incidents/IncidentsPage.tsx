import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, Siren } from "lucide-react";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import type { IncidentRoom } from "../../api/client";
import { addIncidentComment, apiFetch, completeChecklistItem, getIncidentRoom, updateIncidentStatus } from "../../api/client";
import { ALARM_ACTION_ROLES, useCan, useSession } from "../../app/session";
import { useRuntimeStore } from "../../app/store/runtime";
import { Button, EmptyState, ErrorNotice, Mono, PageHeader, StatusBadge } from "../../components/ui/primitives";
import { formatDateTime, formatValue } from "../operational-map/format";
import { SectionLabel } from "../operational-map/SideSheet";
import { useOperateRuntime } from "../operational-map/useRuntimeSeed";
import "../operational-map/ops.css";
import { useEscalate } from "./useEscalate";
import "./incidents.css";

const INCIDENT_STATUSES = ["open", "acknowledged", "in_progress", "resolved", "closed"] as const;
const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  acknowledged: "Acknowledged",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const listIncidents = (signal?: AbortSignal) => apiFetch<{ incident_ids: string[] }>("/api/incidents", { signal });

function severityKind(sev: string | undefined) {
  return sev === "critical" ? "critical" : sev === "warning" ? "high" : "low";
}

export function IncidentsPage() {
  useOperateRuntime();
  const ready = useSession((s) => s.status === "ready");
  const canAct = useCan(ALARM_ACTION_ROLES);
  const [params, setParams] = useSearchParams();
  const selectedId = params.get("id");
  const situation = useRuntimeStore((s) => s.activeSituation);
  const escalate = useEscalate();

  const list = useQuery({ queryKey: ["incidents"], queryFn: ({ signal }) => listIncidents(signal), enabled: ready, refetchInterval: 10_000 });
  const ids = [...(list.data?.incident_ids ?? [])].reverse();
  const rooms = useQueries({
    queries: ids.map((id) => ({
      queryKey: ["incident", id],
      queryFn: ({ signal }: { signal: AbortSignal }) => getIncidentRoom(id, signal),
      enabled: ready,
      refetchInterval: 5_000,
    })),
  });
  const select = (id: string) => setParams({ id }, { replace: true });

  return (
    <div className="pl-page inc-page">
      <PageHeader
        title="Incidents"
        description="Incident rooms keep the evidence, checklist and decisions of an escalated situation together for handover."
        actions={
          situation && canAct ? (
            <Button variant="primary" icon={<Siren />} onClick={() => escalate.mutate()} busy={escalate.isPending}>
              Open room for “{situation.title}”
            </Button>
          ) : null
        }
      />
      {escalate.error ? <ErrorNotice error={escalate.error} /> : null}
      {list.error ? <ErrorNotice error={list.error} /> : null}
      <div className="inc-layout">
        <nav className="inc-list" aria-label="Incident rooms">
          {ids.length ? (
            <ul>
              {ids.map((id, i) => {
                const room = rooms[i]?.data;
                return (
                  <li key={id}>
                    <button
                      type="button"
                      className="inc-list__item"
                      aria-current={selectedId === id ? "true" : undefined}
                      onClick={() => select(id)}
                    >
                      <span className="inc-list__title">{room?.title ?? id}</span>
                      <span className="inc-list__meta">
                        {room ? <StatusBadge compact status={severityKind(room.severity)} label={room.severity} /> : null}
                        <span className="ops-muted">{STATUS_LABEL[room?.status ?? ""] ?? room?.status ?? "…"}</span>
                        <Mono className="ops-subtle">{id.slice(0, 12)}</Mono>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState title="No incident rooms yet">
              {situation
                ? "Open a room from the active situation to start a shared record."
                : "Rooms are opened from an active situation (Overview → Calm Card → Open incident room)."}
            </EmptyState>
          )}
        </nav>
        <section className="inc-detail" aria-label="Incident room">
          {selectedId ? (
            <RoomView id={selectedId} canAct={canAct} />
          ) : (
            <EmptyState title="Select an incident room">Pick a room on the left to see its evidence, checklist and timeline.</EmptyState>
          )}
        </section>
      </div>
    </div>
  );
}

function RoomView({ id, canAct }: { id: string; canAct: boolean }) {
  const ready = useSession((s) => s.status === "ready");
  const client = useQueryClient();
  const room = useQuery({ queryKey: ["incident", id], queryFn: ({ signal }) => getIncidentRoom(id, signal), enabled: ready, refetchInterval: 5_000 });
  const [comment, setComment] = useState("");
  const onDone = (data: { incident: IncidentRoom }) => {
    client.setQueryData(["incident", id], data.incident);
    void client.invalidateQueries({ queryKey: ["incident", id] });
  };
  const status = useMutation({ mutationFn: (s: string) => updateIncidentStatus(id, s), onSuccess: onDone });
  const check = useMutation({ mutationFn: (itemId: string) => completeChecklistItem(id, itemId), onSuccess: onDone });
  const post = useMutation({
    mutationFn: (m: string) => addIncidentComment(id, m),
    onSuccess: (d) => {
      setComment("");
      onDone(d);
    },
  });

  if (room.error) return <ErrorNotice error={room.error} />;
  const r = room.data;
  if (!r) return <EmptyState title="Loading incident room…" />;
  const live = r.live_state;
  const done = r.checklist.filter((c) => c.status === "done").length;

  return (
    <div className="inc-room">
      <header className="inc-room__head">
        <div>
          <div className="inc-room__eyebrow">
            <StatusBadge status={severityKind(r.severity)} label={r.severity} /> <Mono className="ops-subtle">{r.incident_id}</Mono>
          </div>
          <h2 className="inc-room__title">{r.title}</h2>
          <div className="ops-muted">
            Root asset <strong>{r.root_asset?.name ?? "—"}</strong> <Mono className="ops-subtle">{r.root_asset?.asset_id}</Mono>
          </div>
        </div>
        <label className="pl-field inc-room__status">
          <span>Status</span>
          <select
            className="pl-select"
            value={r.status}
            disabled={!canAct || status.isPending}
            onChange={(e) => status.mutate(e.target.value)}
          >
            {INCIDENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </label>
      </header>
      {status.error || check.error || post.error ? <ErrorNotice error={status.error ?? check.error ?? post.error} /> : null}

      <div className="inc-room__grid">
        <section className="inc-card">
          <SectionLabel aside={live ? (live.still_active ? "situation still active" : "situation cleared") : undefined}>Live state</SectionLabel>
          {live ? (
            <>
              <p className="inc-live">
                <strong>{live.active_alarm_count}</strong> active alarm{live.active_alarm_count === 1 ? "" : "s"} on the plant.
              </p>
              <ul className="inc-values">
                {live.latest_value_summary.map((v) => (
                  <li key={v.tag_id}>
                    <Mono className="ops-muted">{v.tag_id}</Mono>
                    <Mono>{formatValue(v.value, v.unit)}</Mono>
                    <span className={`inc-q${v.quality !== "GOOD" ? " is-bad" : ""}`}>{v.quality}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="ops-empty-inline">No live state attached.</p>
          )}
        </section>

        <section className="inc-card">
          <SectionLabel aside={`${done}/${r.checklist.length} done`}>Checklist</SectionLabel>
          <ul className="inc-check">
            {r.checklist.map((c) => (
              <li key={c.id} className={c.status === "done" ? "is-done" : undefined}>
                {c.status === "done" ? <CheckCircle2 aria-hidden /> : <Circle aria-hidden />}
                <span className="inc-check__label">{c.label}</span>
                {c.status !== "done" && canAct ? (
                  <Button size="sm" variant="ghost" onClick={() => check.mutate(c.id)} busy={check.isPending && check.variables === c.id}>
                    Mark done
                  </Button>
                ) : (
                  <span className="ops-subtle inc-check__state">{c.status}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="inc-card">
        <SectionLabel aside="oldest first">Timeline</SectionLabel>
        <ol className="inc-timeline">
          {r.timeline.map((t) => (
            <li key={t.id}>
              <Mono className="inc-timeline__t">{formatDateTime(t.timestamp)}</Mono>
              <span className="inc-timeline__type">{t.type.replace(/_/g, " ")}</span>
              <span className="inc-timeline__msg">
                {t.message} <span className="ops-subtle">— {t.actor}</span>
              </span>
            </li>
          ))}
        </ol>
        {canAct ? (
          <form
            className="inc-comment"
            onSubmit={(e) => {
              e.preventDefault();
              if (comment.trim()) post.mutate(comment.trim());
            }}
          >
            <input
              className="pl-input"
              placeholder="Add a note for the next shift…"
              aria-label="Add a comment"
              value={comment}
              maxLength={2000}
              onChange={(e) => setComment(e.target.value)}
            />
            <Button type="submit" disabled={!comment.trim()} busy={post.isPending}>
              Post
            </Button>
          </form>
        ) : null}
      </section>
    </div>
  );
}
