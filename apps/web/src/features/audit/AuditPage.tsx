import * as Dialog from "@radix-ui/react-dialog";
import { Bot, ChevronLeft, ChevronRight, Cpu, ShieldAlert, ShieldCheck, UserRound, X } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import type { AuditRecord } from "../../api/v2";
import { Button, EmptyState, ErrorNotice, IconButton, PageHeader, Panel } from "../../components/ui/primitives";
import { formatTime } from "../approvals/diffFormat";
import { CopyButton, focusContent } from "../approvals/engUi";
import {
  ACTION_PREFIXES,
  entityHref,
  nextOffset,
  PAGE_SIZES,
  pageInfo,
  prevOffset,
  setEntity,
  setPageSize,
  togglePrefix,
  truncateHash,
  useAuditPage,
} from "./auditModel";
import type { AuditQueryState } from "./auditModel";
import "../approvals/approvals.css";
import "../pattern-library/pattern-library.css";
import "./audit.css";

function ActorIcon({ type }: { type: string }) {
  if (type === "agent") return <Bot aria-hidden />;
  if (type === "system") return <Cpu aria-hidden />;
  return <UserRound aria-hidden />;
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === undefined || value === null) {
    return (
      <div className="aud-json">
        <h4 className="eng-subhead">{label}</h4>
        <p className="eng-muted">—</p>
      </div>
    );
  }
  const text = JSON.stringify(value, null, 2);
  const lines = text.split("\n").length;
  return (
    <details className="aud-json" open={lines <= 24}>
      <summary>
        <h4 className="eng-subhead">{label}</h4>
        <span className="eng-muted">{lines} lines</span>
        <CopyButton value={text} label={`Copy ${label.toLowerCase()} JSON`} />
      </summary>
      <pre className="eng-json">{text}</pre>
    </details>
  );
}

function HashRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="aud-hash">
      <dt>{label}</dt>
      <dd>
        <span className="pl-mono" title={value}>{truncateHash(value, 16, 12)}</span>
        <CopyButton value={value} label={`Copy ${label}`} />
      </dd>
    </div>
  );
}

function RecordDrawer({ record, onClose }: { record: AuditRecord; onClose: () => void }) {
  const href = entityHref(record);
  return (
    <Dialog.Root open onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content className="plib-drawer aud-drawer" onOpenAutoFocus={focusContent} tabIndex={-1}>
          <header className="plib-drawer__head">
            <div>
              <Dialog.Title className="pl-dialog__title pl-mono">{record.action}</Dialog.Title>
              <Dialog.Description className="pl-dialog__desc">
                {formatTime(record.ts)} · {record.actor_id ?? record.actor_type}
                {record.actor_role ? ` (${record.actor_role})` : ""}
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <IconButton label="Close" icon={<X />} />
            </Dialog.Close>
          </header>
          <div className="plib-drawer__body">
            <dl className="eng-meta aud-meta">
              <div><dt>Entity</dt><dd>{record.entity_type} {record.entity_id ? <span className="pl-mono">{record.entity_id}</span> : null}</dd></div>
              <div><dt>Actor type</dt><dd>{record.actor_type}</dd></div>
              <div><dt>Audit id</dt><dd className="pl-mono eng-trunc" title={record.audit_id}>{record.audit_id}</dd></div>
            </dl>
            {href ? <Link className="eng-link" to={href} onClick={onClose}>Open {record.entity_type.replace(/_/g, " ")}</Link> : null}
            {record.reason ? (
              <div>
                <h4 className="eng-subhead">Reason</h4>
                <blockquote className="eng-quote">{record.reason}</blockquote>
              </div>
            ) : null}
            <div className="aud-ba">
              <JsonBlock label="Before" value={record.before} />
              <JsonBlock label="After" value={record.after} />
            </div>
            <div>
              <h4 className="eng-subhead">Hash chain</h4>
              <dl className="aud-hashes">
                <HashRow label="hash_prev" value={record.hash_prev} />
                <HashRow label="hash_self" value={record.hash_self} />
              </dl>
              <p className="eng-muted aud-note">hash_self = SHA-256 over this record and hash_prev. Editing any earlier record breaks every hash after it.</p>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function AuditPage() {
  const [state, setState] = useState<AuditQueryState>({ action: null, entityId: "", limit: 50, offset: 0 });
  const [open, setOpen] = useState<AuditRecord | null>(null);
  const audit = useAuditPage(state);
  const data = audit.data;
  const info = pageInfo(data?.total ?? 0, state.limit, state.offset);
  const chain = data?.chain;

  return (
    <div className="pl-page">
      <PageHeader
        title="Audit ledger"
        description="Append-only, hash-chained record of every draft, review, deployment, rollback, alarm action and agent proposal."
      />
      {chain ? (
        chain.valid ? (
          <div className="eng-banner eng-banner--ok aud-integrity" role="status">
            <ShieldCheck aria-hidden />
            <div>
              <strong>Chain intact.</strong> <span className="eng-muted">All {chain.checked_records} records verified: each hash matches its content and links to the one before.</span>
            </div>
          </div>
        ) : (
          <div className="eng-banner eng-banner--bad aud-integrity" role="alert">
            <ShieldAlert aria-hidden />
            <div>
              <strong>Chain broken at record #{chain.broken_index ?? "?"}.</strong>{" "}
              <span>{chain.reason ?? "A stored hash does not match its record."}</span>
              <p>Records after this point cannot be trusted. Export the ledger and compare with a backup; do not edit records in place.</p>
            </div>
          </div>
        )
      ) : null}

      <Panel padded={false}>
        <div className="aud-filters">
          <div className="aud-chips" role="group" aria-label="Filter by action">
            <button type="button" className="aud-chip" aria-pressed={!state.action} onClick={() => setState((s) => ({ ...s, action: null, offset: 0 }))}>
              All
            </button>
            {ACTION_PREFIXES.map((p) => (
              <button
                key={p.prefix}
                type="button"
                className="aud-chip"
                aria-pressed={state.action === p.prefix}
                onClick={() => setState((s) => togglePrefix(s, p.prefix))}
              >
                <span className="pl-mono">{p.prefix}</span>
              </button>
            ))}
          </div>
          <label className="aud-entity">
            <span className="eng-sr-only">Entity id</span>
            <input
              className="pl-input"
              type="search"
              placeholder="Filter by exact entity id…"
              value={state.entityId}
              onChange={(e) => setState((s) => setEntity(s, e.target.value.trim()))}
            />
          </label>
        </div>
        {audit.error ? <div className="pl-panel__body"><ErrorNotice error={audit.error} /></div> : null}
        <div className="plib-scroll">
          <table className="pl-table aud-table">
            <thead>
              <tr>
                <th scope="col">Time</th>
                <th scope="col">Actor</th>
                <th scope="col">Action</th>
                <th scope="col">Entity</th>
                <th scope="col">Reason</th>
              </tr>
            </thead>
            <tbody>
              {(data?.records ?? []).map((r) => (
                <tr key={r.audit_id} className="aud-row" aria-selected={open?.audit_id === r.audit_id}>
                  <td className="pl-mono aud-time">{formatTime(r.ts)}</td>
                  <td>
                    <span className="aud-actor">
                      <ActorIcon type={r.actor_type} />
                      <span>{r.actor_id ?? r.actor_type}</span>
                      {r.actor_role ? <span className="aud-role">{r.actor_role}</span> : null}
                    </span>
                  </td>
                  <td>
                    <button type="button" className="aud-open pl-mono" onClick={() => setOpen(r)} aria-haspopup="dialog">
                      {r.action}
                    </button>
                  </td>
                  <td className="aud-entity-cell">
                    <span className="eng-muted">{r.entity_type}</span>{" "}
                    {r.entity_id ? <span className="pl-mono" title={r.entity_id}>{r.entity_id.length > 14 ? `${r.entity_id.slice(0, 8)}…` : r.entity_id}</span> : null}
                  </td>
                  <td className="aud-reason">{r.reason ?? <span className="eng-muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && !data.records.length ? (
          <EmptyState title="No records match">{state.action ? `Nothing with action ${state.action}* yet.` : "The ledger is empty."}</EmptyState>
        ) : null}
        <div className="aud-pager">
          <span className="eng-muted" aria-live="polite">
            {data ? `${info.from}–${info.to} of ${data.total}` : "…"}
          </span>
          <label className="aud-size">
            <span>Rows</span>
            <select className="pl-select" value={state.limit} onChange={(e) => setState((s) => setPageSize(s, Number(e.target.value)))}>
              {PAGE_SIZES.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <Button size="sm" icon={<ChevronLeft />} disabled={!info.hasPrev} onClick={() => setState((s) => ({ ...s, offset: prevOffset(s) }))}>
            Newer
          </Button>
          <span className="pl-mono aud-page">
            {info.page}/{info.pages}
          </span>
          <Button size="sm" disabled={!info.hasNext} onClick={() => setState((s) => ({ ...s, offset: nextOffset(s, data?.total ?? 0) }))}>
            Older <ChevronRight className="aud-chev" aria-hidden />
          </Button>
        </div>
      </Panel>
      {open ? <RecordDrawer record={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
