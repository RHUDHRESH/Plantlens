import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useMemo, useState } from "react";
import { useShelveAlarm } from "../../api/queries";
import { Button, ErrorNotice, PriorityGlyph } from "../../components/ui/primitives";
import { Time } from "../../components/ui/Time";
import { runtimeNow } from "../operational-map/runtimeClock";
import type { AlarmRow } from "./alarmModel";
import { PRIORITY_LABEL, SHELVE_PRESETS, allowedShelvePresets, validateShelve } from "./alarmModel";

/** P1 acknowledgement confirm — ack means "I have seen this", not "this is fixed". */
export function AckConfirmDialog({
  rows,
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  rows: AlarmRow[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  busy?: boolean;
}) {
  const p1 = rows.filter((r) => r.priority === 1);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content className="pl-dialog" aria-describedby="ack-confirm-desc">
          <Dialog.Title className="pl-dialog__title">
            Acknowledge {rows.length === 1 ? "this alarm" : `${rows.length} alarms`}?
          </Dialog.Title>
          <p id="ack-confirm-desc" className="pl-dialog__desc">
            {p1.length === 1 ? "One is" : `${p1.length} are`} priority 1. Acknowledging records that you have seen
            {rows.length === 1 ? " it" : " them"}; it does not clear the condition. The ack is written to the audit ledger.
          </p>
          <ul className="alm-confirm-list">
            {rows.map((r) => (
              <li key={r.id}>
                <PriorityGlyph status={r.status} title={PRIORITY_LABEL[r.priority]} />
                <span className="alm-confirm-list__msg">{r.message}</span>
                <span className="ops-id">{r.assetName}</span>
              </li>
            ))}
          </ul>
          <div className="alm-dialog-actions">
            <Dialog.Close asChild>
              <Button variant="ghost">Cancel</Button>
            </Dialog.Close>
            <Button variant="primary" onClick={onConfirm} busy={busy ?? false}>
              Acknowledge {rows.length > 1 ? rows.length : ""}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ShelveDialog({
  row,
  open,
  onOpenChange,
}: {
  row: AlarmRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const allowed = useMemo(() => allowedShelvePresets(row?.rule), [row]);
  const [seconds, setSeconds] = useState<number | null>(null);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const shelve = useShelveAlarm();

  useEffect(() => {
    if (open) {
      setSeconds(allowed[0] ?? null);
      setReason("");
      setTouched(false);
      shelve.reset();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, row?.id]);

  const validation = validateShelve({ seconds, reason, rule: row?.rule });
  const reasonError = touched ? validation.errors.find((e) => e.field === "reason") : undefined;
  const ruleError = validation.errors.find((e) => e.field === "rule");
  const untilMs = seconds ? runtimeNow() + seconds * 1000 : null;

  const submit = () => {
    setTouched(true);
    if (!row || !validation.ok || seconds === null) return;
    shelve.mutate(
      { alarmId: row.id, durationS: seconds, reason: reason.trim() },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="pl-dialog-overlay" />
        <Dialog.Content className="pl-dialog" aria-describedby="shelve-desc">
          <Dialog.Title className="pl-dialog__title">Shelve alarm</Dialog.Title>
          <p id="shelve-desc" className="pl-dialog__desc">
            A shelved alarm stays visible in the Shelved tab with your name, reason and expiry. It returns
            automatically when the time runs out.
          </p>
          {row ? (
            <div className="alm-shelve-target">
              <PriorityGlyph status={row.status} title={PRIORITY_LABEL[row.priority]} />
              <div>
                <div className="alm-shelve-target__msg">{row.message}</div>
                <div className="ops-id">
                  {row.id} · {row.assetName}
                </div>
              </div>
            </div>
          ) : null}
          {ruleError ? <div className="ops-callout ops-callout--attention">{ruleError.message}</div> : null}
          <form
            className="alm-shelve-form"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <fieldset className="alm-fieldset">
              <legend>Duration</legend>
              <div className="alm-presets" role="radiogroup" aria-label="Shelve duration">
                {SHELVE_PRESETS.map((p) => {
                  const disabled = !allowed.includes(p.seconds);
                  return (
                    <label key={p.seconds} className={`alm-preset${seconds === p.seconds ? " is-active" : ""}${disabled ? " is-disabled" : ""}`}>
                      <input
                        type="radio"
                        name="shelve-duration"
                        value={p.seconds}
                        checked={seconds === p.seconds}
                        disabled={disabled}
                        onChange={() => setSeconds(p.seconds)}
                      />
                      {p.label}
                    </label>
                  );
                })}
              </div>
              {row?.rule?.max_shelve_seconds ? (
                <p className="alm-hint">This rule allows at most {Math.round(row.rule.max_shelve_seconds / 60)} min.</p>
              ) : null}
            </fieldset>
            <label className="pl-field">
              <span>Reason (required)</span>
              <textarea
                className="pl-textarea"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                onBlur={() => setTouched(true)}
                placeholder="e.g. Sensor under maintenance, work order 4471"
                aria-invalid={reasonError ? true : undefined}
                aria-describedby={reasonError ? "shelve-reason-err" : undefined}
                maxLength={500}
              />
              {reasonError ? (
                <span id="shelve-reason-err" className="alm-field-error" role="alert">
                  {reasonError.message}
                </span>
              ) : null}
            </label>
            <div className="alm-until" aria-live="polite">
              Returns at{" "}
              <strong className="ops-num">
                <Time value={untilMs} />
              </strong>{" "}
              <span className="ops-subtle">
                (<Time value={untilMs} format="datetime" />, runtime clock in your time zone)
              </span>
            </div>
            {shelve.error ? <ErrorNotice error={shelve.error} /> : null}
            <div className="alm-dialog-actions">
              <Dialog.Close asChild>
                <Button variant="ghost">Cancel</Button>
              </Dialog.Close>
              <Button variant="primary" type="submit" busy={shelve.isPending} disabled={!!ruleError}>
                Shelve alarm
              </Button>
            </div>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
