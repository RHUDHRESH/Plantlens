import { useCallback, useEffect, useMemo, useState } from "react";
import type { WsConnectionState } from "../../api/types";
import { cn } from "../../lib/cn";
import { extractTagIds } from "./api";
import { formatDecodedValue, formatDisplayValue, formatTimestamp } from "./format";
import {
  formatLastSeen,
  formatLiveValue,
  scanRowRuntimeLabel,
  verificationDotClass,
  verificationPillClass,
  verifyLiveTag,
} from "./liveVerification";
import type { Binding, ConnectionFormState, DataQuality, ScanRequest, ScanRow } from "./types";
import { useConnectionPanel } from "./useConnectionPanel";

export interface ConnectionScreenProps {
  runtimeConnection?: WsConnectionState | string;
  runtimeTags?: Record<string, unknown>;
  runtimeLastSnapshotTs?: string | null;
  onOpenAtlas?: (assetId?: string | null) => void;
}

function QualityBadge({ quality }: { quality: DataQuality }) {
  if (quality === "GOOD") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-ink-700">
        <span className="w-1.5 h-1.5 rounded-full bg-healthy shrink-0" aria-hidden />
        GOOD
      </span>
    );
  }
  if (quality === "UNCERTAIN" || quality === "STALE") {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-advisory-tint text-advisory">
        {quality}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-critical-tint text-critical">
      {quality}
    </span>
  );
}

function Card({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "bg-surface border border-line rounded-lg p-3 flex flex-col gap-2 min-h-0",
        className,
      )}
    >
      <h3 className="text-xs font-medium uppercase tracking-wide text-ink-500">{title}</h3>
      {children}
    </section>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid grid-cols-[88px_1fr] items-center gap-2 text-xs">
      <span className="text-ink-500">{label}</span>
      {children}
    </label>
  );
}

function StatusRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[88px_1fr] items-baseline gap-2 text-xs">
      <span className="text-ink-500">{label}</span>
      <span className="font-mono tabular-nums text-ink-900 truncate">{value}</span>
    </div>
  );
}

const inputClass =
  "w-full h-7 px-2 text-xs font-mono tabular-nums border border-line rounded bg-surface-sunken text-ink-900 focus:outline-none focus:ring-1 focus:ring-accent";

const btnClass =
  "h-7 px-3 text-xs font-medium rounded border border-line bg-surface hover:bg-surface-sunken disabled:opacity-50 disabled:cursor-not-allowed";

const btnPrimaryClass =
  "h-7 px-3 text-xs font-medium rounded border border-accent bg-accent-tint text-accent hover:bg-accent-tint/80 disabled:opacity-50 disabled:cursor-not-allowed";

function wsStatusLabel(state: string | undefined): string {
  switch (state) {
    case "live":
      return "Live";
    case "connecting":
      return "Connecting";
    case "stale":
      return "Stale";
    case "disconnected":
      return "Disconnected";
    default:
      return "—";
  }
}

function modbusStatusLabel(connected: boolean | undefined): string {
  if (connected === true) return "Connected";
  if (connected === false) return "Offline";
  return "—";
}

export function ConnectionScreen({
  runtimeConnection,
  runtimeTags = {},
  runtimeLastSnapshotTs,
  onOpenAtlas,
}: ConnectionScreenProps) {
  const panel = useConnectionPanel();
  const tagIds = useMemo(() => extractTagIds(panel.model), [panel.model]);
  const runtimeTagCount = Object.keys(runtimeTags).length;

  const [bindingDraft, setBindingDraft] = useState<Binding | null>(null);

  useEffect(() => {
    if (!panel.selectedRow) {
      setBindingDraft(null);
      return;
    }
    const row = panel.selectedRow;
    const existing = panel.pendingBindings.find((b) => b.channelRef === row.channelRef);
    if (existing) {
      setBindingDraft(existing);
      return;
    }
    setBindingDraft({
      channelRef: row.channelRef,
      tagId: row.suggestedTag ?? "",
      equipment: row.equipment ?? "",
      dataType: row.dataType,
      wordOrder: row.wordOrder,
      unit: "",
      scale: 1,
      offset: 0,
    });
  }, [panel.selectedRow, panel.pendingBindings]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panel.selectedRow) {
        panel.selectRow(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel.selectedRow, panel.selectRow]);

  const updateDraft = useCallback((patch: Partial<Binding>) => {
    setBindingDraft((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const canAddBinding = Boolean(
    panel.selectedRow &&
      bindingDraft?.channelRef &&
      bindingDraft.tagId.trim() &&
      bindingDraft.equipment.trim() &&
      Number.isFinite(bindingDraft.scale) &&
      Number.isFinite(bindingDraft.offset),
  );

  const handleAddPending = () => {
    if (!bindingDraft || !canAddBinding) return;
    panel.addOrUpdatePendingBinding(bindingDraft);
  };

  const handleRemovePending = () => {
    if (!bindingDraft?.channelRef) return;
    panel.removePendingBinding(bindingDraft.channelRef);
  };

  const hasPendingForRow = panel.pendingBindings.some(
    (b) => b.channelRef === panel.selectedRow?.channelRef,
  );

  const activeTagId = bindingDraft?.tagId?.trim() || panel.selectedRow?.boundTag || "";
  const tagPending = Boolean(
    activeTagId &&
      panel.pendingBindings.some(
        (b) => b.tagId === activeTagId || b.channelRef === panel.selectedRow?.channelRef,
      ),
  );
  const tagCommitted = activeTagId ? panel.isTagCommitted(activeTagId) : false;

  const liveVerification = useMemo(
    () =>
      verifyLiveTag({
        tagId: activeTagId || null,
        pending: tagPending,
        committed: tagCommitted,
        runtimeTags,
      }),
    [activeTagId, tagPending, tagCommitted, runtimeTags],
  );

  const liveValueDisplay = formatLiveValue(
    liveVerification.value,
    liveVerification.unit,
    liveVerification.quality,
  );

  const anyCommittedTagLive = useMemo(() => {
    for (const tagId of panel.committedTagIds) {
      const result = verifyLiveTag({
        tagId,
        pending: false,
        committed: true,
        runtimeTags,
      });
      if (result.state === "live_good") return result;
    }
    return null;
  }, [panel.committedTagIds, runtimeTags]);

  const portsMessage = panel.portsError
    ? "Connection API unavailable: GET /api/ports failed."
    : !panel.portsLoading && panel.ports.length === 0
      ? "No serial ports returned by /api/ports."
      : null;

  return (
    <div className="connection-screen flex flex-col min-h-0 flex-1 bg-canvas">
      {panel.endpointErrors.length > 0 && (
        <div
          className="shrink-0 px-4 py-2 bg-advisory-tint border-b border-line text-xs"
          role="alert"
        >
          <span className="font-medium text-advisory">Backend seam incomplete</span>
          <ul className="mt-1 space-y-0.5 text-ink-700">
            {panel.endpointErrors.map((err) => (
              <li key={err.endpoint}>
                {err.endpoint} failed{err.status ? ` (${err.status})` : ""}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <header className="shrink-0 h-[72px] px-4 flex items-center justify-between border-b border-line bg-surface">
        <div>
          <h1 className="text-base font-medium text-ink-900">Connection / Commissioning</h1>
          <p className="text-xs text-ink-500 mt-0.5">
            Bind live Modbus channels to the plant model. Read-only. No control writes.
          </p>
        </div>
        <div className="flex items-center gap-4 text-xs text-ink-500">
          <span>
            Modbus:{" "}
            <span className="font-mono tabular-nums text-ink-900">
              {modbusStatusLabel(panel.status?.connected)}
            </span>
          </span>
          <span>
            WS runtime:{" "}
            <span className="font-mono tabular-nums text-ink-900">
              {wsStatusLabel(runtimeConnection)}
            </span>
          </span>
          <span>
            Snapshot:{" "}
            <span className="font-mono tabular-nums text-ink-900">
              {runtimeLastSnapshotTs ?? "—"}
            </span>
          </span>
          <span>
            Runtime tags:{" "}
            <span className="font-mono tabular-nums text-ink-900">{runtimeTagCount} live tags</span>
          </span>
        </div>
      </header>

      <main className="flex-1 min-h-0 grid grid-cols-[300px_minmax(0,1fr)_360px] gap-3 p-3 overflow-hidden">
        {/* Left column */}
        <div className="flex flex-col gap-3 min-h-0 overflow-y-auto">
          <Card title="Link Setup">
            <FieldRow label="Port">
              <div className="flex gap-1">
                <select
                  className={inputClass}
                  value={panel.form.port}
                  onChange={(e) => panel.updateForm({ port: e.target.value })}
                  aria-label="Serial port"
                >
                  <option value="">Select port…</option>
                  {panel.ports.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className={btnClass}
                  onClick={panel.refreshPorts}
                  aria-label="Refresh ports"
                >
                  ↻
                </button>
              </div>
            </FieldRow>
            {portsMessage && <p className="text-xs text-advisory">{portsMessage}</p>}
            <FieldRow label="Baudrate">
              <input
                type="number"
                className={inputClass}
                value={panel.form.baudrate}
                onChange={(e) => panel.updateForm({ baudrate: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Parity">
              <select
                className={inputClass}
                value={panel.form.parity}
                onChange={(e) =>
                  panel.updateForm({ parity: e.target.value as ConnectionFormState["parity"] })
                }
              >
                <option value="N">N</option>
                <option value="E">E</option>
                <option value="O">O</option>
              </select>
            </FieldRow>
            <FieldRow label="Stop bits">
              <input
                type="number"
                className={inputClass}
                value={panel.form.stopbits}
                onChange={(e) => panel.updateForm({ stopbits: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Byte size">
              <input
                type="number"
                className={inputClass}
                value={panel.form.bytesize}
                onChange={(e) => panel.updateForm({ bytesize: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Slave ID">
              <input
                type="number"
                className={inputClass}
                value={panel.form.slaveId}
                onChange={(e) => panel.updateForm({ slaveId: Number(e.target.value) })}
              />
            </FieldRow>
            <FieldRow label="Poll Hz">
              <input
                type="number"
                className={inputClass}
                value={panel.form.pollHz}
                onChange={(e) => panel.updateForm({ pollHz: Number(e.target.value) })}
              />
            </FieldRow>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                className={btnPrimaryClass}
                disabled={!panel.form.port || panel.connectPending}
                onClick={panel.connect}
              >
                Connect
              </button>
              <button
                type="button"
                className={btnClass}
                disabled={panel.disconnectPending}
                onClick={panel.disconnect}
              >
                Disconnect
              </button>
              <button
                type="button"
                className={btnClass}
                disabled={panel.scanPending}
                onClick={panel.scan}
              >
                Scan registers
              </button>
            </div>
          </Card>

          <Card title="Connection Status">
            <StatusRow
              label="Connected"
              value={panel.status?.connected ? "Yes" : "No"}
            />
            <StatusRow label="Port" value={formatDisplayValue(panel.status?.port)} />
            <StatusRow
              label="Slave ID"
              value={formatDisplayValue(panel.status?.slaveId)}
            />
            <StatusRow label="Poll Hz" value={formatDisplayValue(panel.status?.pollHz)} />
            <StatusRow
              label="Last poll"
              value={formatTimestamp(panel.status?.lastPollTs)}
            />
            <StatusRow label="OK reads" value={formatDisplayValue(panel.status?.okCount)} />
            <StatusRow label="Errors" value={formatDisplayValue(panel.status?.errorCount)} />
            <StatusRow label="Last error" value={formatDisplayValue(panel.status?.lastError)} />
          </Card>

          <Card title="Safety Contract">
            <p className="text-xs font-medium text-ink-900">READ-ONLY</p>
            <p className="text-xs text-ink-500 leading-relaxed">
              PlantLens reads Modbus registers only. No coil/register writes are issued from this
              screen. Trips and protection stay on the controller. Binding commits update PlantLens
              model files, not control hardware.
            </p>
          </Card>

          <Card title="Demo flow">
            <ol className="text-xs text-ink-500 list-decimal list-inside space-y-1 leading-relaxed">
              <li>Connect RS485</li>
              <li>Scan input registers</li>
              <li>Bind channel to tag</li>
              <li>Commit model</li>
              <li>Confirm runtime TagFrame</li>
              <li>Open in Atlas</li>
            </ol>
          </Card>
        </div>

        {/* Center column */}
        <div className="flex flex-col gap-3 min-h-0 overflow-hidden">
          <Card title="Scan Controls" className="shrink-0">
            <div className="grid grid-cols-5 gap-2">
              <FieldRow label="Start reg">
                <input
                  type="number"
                  className={inputClass}
                  value={panel.scanRequest.startReg}
                  onChange={(e) =>
                    panel.updateScanRequest({ startReg: Number(e.target.value) })
                  }
                />
              </FieldRow>
              <FieldRow label="Count">
                <input
                  type="number"
                  className={inputClass}
                  value={panel.scanRequest.count}
                  onChange={(e) =>
                    panel.updateScanRequest({ count: Number(e.target.value) })
                  }
                />
              </FieldRow>
              <FieldRow label="Reg type">
                <select
                  className={inputClass}
                  value={panel.scanRequest.regType}
                  onChange={(e) =>
                    panel.updateScanRequest({
                      regType: e.target.value as ScanRequest["regType"],
                    })
                  }
                >
                  <option value="input">input</option>
                  <option value="holding">holding</option>
                </select>
              </FieldRow>
              <FieldRow label="Data type">
                <select
                  className={inputClass}
                  value={panel.scanRequest.dataType}
                  onChange={(e) =>
                    panel.updateScanRequest({
                      dataType: e.target.value as ScanRequest["dataType"],
                    })
                  }
                >
                  <option value="float32">float32</option>
                  <option value="int16">int16</option>
                  <option value="uint16">uint16</option>
                  <option value="int32">int32</option>
                  <option value="uint32">uint32</option>
                </select>
              </FieldRow>
              <FieldRow label="Word order">
                <select
                  className={inputClass}
                  value={panel.scanRequest.wordOrder}
                  onChange={(e) =>
                    panel.updateScanRequest({
                      wordOrder: e.target.value as ScanRequest["wordOrder"],
                    })
                  }
                >
                  <option value="AB">AB</option>
                  <option value="BA">BA</option>
                </select>
              </FieldRow>
            </div>
            <button
              type="button"
              className={cn(btnPrimaryClass, "self-start mt-1")}
              disabled={panel.scanPending}
              onClick={panel.scan}
            >
              Scan
            </button>
          </Card>

          <Card title="Scan Results" className="flex-1 min-h-0 overflow-hidden">
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-xs border-collapse">
                <thead className="sticky top-0 bg-surface-sunken z-10">
                  <tr className="border-b border-line text-left text-ink-500">
                    <th className="p-1.5 font-medium">Quality</th>
                    <th className="p-1.5 font-medium">Channel</th>
                    <th className="p-1.5 font-medium">Register</th>
                    <th className="p-1.5 font-medium">Raw</th>
                    <th className="p-1.5 font-medium">Decoded</th>
                    <th className="p-1.5 font-medium">Suggested tag</th>
                    <th className="p-1.5 font-medium">Bound tag</th>
                    <th className="p-1.5 font-medium">Runtime</th>
                    <th className="p-1.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {panel.scanRows.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="p-4 text-center text-ink-500">
                        No scan yet. Connect and scan input registers 0–41.
                      </td>
                    </tr>
                  ) : (
                    panel.scanRows.map((row) => {
                      const pendingBinding = panel.pendingBindings.find(
                        (b) => b.channelRef === row.channelRef,
                      );
                      const rowTagId =
                        pendingBinding?.tagId ?? row.boundTag ?? row.suggestedTag ?? null;
                      return (
                        <ScanTableRow
                          key={row.channelRef}
                          row={row}
                          selected={panel.selectedRow?.channelRef === row.channelRef}
                          hasPending={Boolean(pendingBinding)}
                          runtimeLabel={scanRowRuntimeLabel(
                            rowTagId,
                            Boolean(pendingBinding),
                            rowTagId ? panel.isTagCommitted(rowTagId) : false,
                            runtimeTags,
                          )}
                          onSelect={() => panel.selectRow(row)}
                          onBind={() => panel.selectRow(row)}
                        />
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        {/* Right column */}
        <div className="min-h-0 overflow-y-auto">
          <Card title="Binding Inspector">
            {!panel.selectedRow ? (
              <div className="text-xs text-ink-500 space-y-2">
                <p className="font-medium text-ink-900">Select a channel</p>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Scan registers</li>
                  <li>Select a responding channel</li>
                  <li>Bind channel to tag and equipment</li>
                </ol>
                {tagIds.length > 0 && (
                  <p className="font-mono tabular-nums">{tagIds.length} model tags available</p>
                )}
              </div>
            ) : (
              <div className="flex flex-col gap-2 text-xs">
                <StatusRow label="Channel" value={panel.selectedRow.channelRef} />
                <StatusRow
                  label="Register"
                  value={String(panel.selectedRow.register)}
                />
                <StatusRow
                  label="Decoded"
                  value={formatDecodedValue(
                    panel.selectedRow.decoded,
                    panel.selectedRow.quality,
                  )}
                />
                <div className="flex items-center gap-2">
                  <span className="text-ink-500 w-[88px]">Quality</span>
                  <QualityBadge quality={panel.selectedRow.quality} />
                </div>
                <button
                  type="button"
                  className={btnClass}
                  disabled={panel.testPending}
                  onClick={panel.testSelectedRow}
                >
                  Test read
                </button>
                {panel.lastTestResult && (
                  <div className="p-2 bg-surface-sunken rounded border border-line font-mono tabular-nums">
                    {panel.lastTestResult.ok ? (
                      <span className="text-ink-900">
                        {formatDisplayValue(panel.lastTestResult.value)}{" "}
                        {panel.lastTestResult.latencyMs !== null
                          ? `(${panel.lastTestResult.latencyMs} ms)`
                          : ""}
                      </span>
                    ) : (
                      <span className="text-critical">
                        {panel.lastTestResult.error ?? "Read failed"}
                      </span>
                    )}
                  </div>
                )}

                {bindingDraft && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-line">
                    <FieldRow label="Tag ID">
                      <input
                        className={inputClass}
                        list="connection-tag-suggestions"
                        value={bindingDraft.tagId}
                        onChange={(e) => updateDraft({ tagId: e.target.value })}
                      />
                    </FieldRow>
                    <datalist id="connection-tag-suggestions">
                      {tagIds.map((id) => (
                        <option key={id} value={id} />
                      ))}
                    </datalist>
                    <FieldRow label="Equipment">
                      <input
                        className={inputClass}
                        value={bindingDraft.equipment}
                        onChange={(e) => updateDraft({ equipment: e.target.value })}
                      />
                    </FieldRow>
                    <FieldRow label="Unit">
                      <input
                        className={inputClass}
                        value={bindingDraft.unit}
                        onChange={(e) => updateDraft({ unit: e.target.value })}
                      />
                    </FieldRow>
                    <FieldRow label="Data type">
                      <select
                        className={inputClass}
                        value={bindingDraft.dataType}
                        onChange={(e) =>
                          updateDraft({
                            dataType: e.target.value as Binding["dataType"],
                          })
                        }
                      >
                        <option value="float32">float32</option>
                        <option value="int16">int16</option>
                        <option value="uint16">uint16</option>
                        <option value="int32">int32</option>
                        <option value="uint32">uint32</option>
                      </select>
                    </FieldRow>
                    <FieldRow label="Word order">
                      <select
                        className={inputClass}
                        value={bindingDraft.wordOrder}
                        onChange={(e) =>
                          updateDraft({
                            wordOrder: e.target.value as Binding["wordOrder"],
                          })
                        }
                      >
                        <option value="AB">AB</option>
                        <option value="BA">BA</option>
                      </select>
                    </FieldRow>
                    <FieldRow label="Scale">
                      <input
                        type="number"
                        className={inputClass}
                        value={bindingDraft.scale}
                        onChange={(e) => updateDraft({ scale: Number(e.target.value) })}
                      />
                    </FieldRow>
                    <FieldRow label="Offset">
                      <input
                        type="number"
                        className={inputClass}
                        value={bindingDraft.offset}
                        onChange={(e) => updateDraft({ offset: Number(e.target.value) })}
                      />
                    </FieldRow>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        className={btnPrimaryClass}
                        disabled={!canAddBinding}
                        onClick={handleAddPending}
                      >
                        {hasPendingForRow ? "Update pending" : "Add pending binding"}
                      </button>
                      {hasPendingForRow && (
                        <button type="button" className={btnClass} onClick={handleRemovePending}>
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {activeTagId && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-line">
                    <p className="text-xs font-medium text-ink-900">Model impact</p>
                    <StatusRow label="Tag" value={activeTagId} />
                    <StatusRow
                      label="Equipment"
                      value={formatDisplayValue(bindingDraft?.equipment)}
                    />
                  </div>
                )}

                {activeTagId && (
                  <div className="flex flex-col gap-2 pt-2 border-t border-line">
                    <p className="text-xs font-medium text-ink-900">Runtime verification</p>
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full shrink-0",
                          verificationDotClass(liveVerification.state),
                        )}
                        aria-hidden
                      />
                      <span
                        className={cn(
                          "text-xs font-medium",
                          verificationPillClass(liveVerification.state),
                        )}
                      >
                        {liveVerification.label}
                      </span>
                    </div>
                    <p className="text-xs text-ink-500">{liveVerification.detail}</p>
                    <StatusRow label="Tag" value={activeTagId} />
                    <StatusRow label="Live value" value={liveValueDisplay} />
                    <StatusRow
                      label="Quality"
                      value={formatDisplayValue(liveVerification.quality)}
                    />
                    <StatusRow
                      label="Last seen"
                      value={formatLastSeen(liveVerification.timestamp)}
                    />
                    {liveVerification.source && (
                      <StatusRow label="Source" value={liveVerification.source} />
                    )}
                    {liveVerification.assetId && (
                      <StatusRow label="Asset" value={liveVerification.assetId} />
                    )}
                    {liveVerification.state === "live_good" && liveVerification.assetId && onOpenAtlas && (
                      <button
                        type="button"
                        className={btnPrimaryClass}
                        onClick={() => onOpenAtlas(liveVerification.assetId)}
                      >
                        Open in Atlas
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
          </Card>

          {anyCommittedTagLive && onOpenAtlas && (
            <button
              type="button"
              className={cn(btnPrimaryClass, "mt-2 w-full")}
              onClick={() => onOpenAtlas(anyCommittedTagLive.assetId)}
            >
              Open Atlas — {anyCommittedTagLive.label} tag live
            </button>
          )}

          {panel.lastCommitMessage && (
            <p className="mt-2 text-xs text-healthy">{panel.lastCommitMessage}</p>
          )}
          {panel.commitError && (
            <p className="mt-2 text-xs text-critical">{panel.commitError}</p>
          )}
        </div>
      </main>

      {panel.pendingBindings.length > 0 && (
        <footer
          className="shrink-0 h-14 px-4 flex items-center justify-between border-t border-line bg-surface shadow-e2"
          aria-label="Pending bindings"
        >
          <span className="text-xs text-ink-700">
            {panel.pendingBindings.length} pending binding change
            {panel.pendingBindings.length !== 1 ? "s" : ""}
          </span>
          <div className="flex gap-2">
            <button type="button" className={btnClass} onClick={panel.clearPendingBindings}>
              Clear
            </button>
            <button
              type="button"
              className={btnPrimaryClass}
              disabled={panel.commitPending}
              onClick={panel.commitPendingBindings}
            >
              Commit to model
            </button>
          </div>
        </footer>
      )}
    </div>
  );
}

function ScanTableRow({
  row,
  selected,
  hasPending,
  runtimeLabel,
  onSelect,
  onBind,
}: {
  row: ScanRow;
  selected: boolean;
  hasPending: boolean;
  runtimeLabel: string;
  onSelect: () => void;
  onBind: () => void;
}) {
  return (
    <tr
      className={cn(
        "border-b border-line cursor-pointer hover:bg-surface-sunken",
        selected && "bg-accent-tint border-l-2 border-l-accent",
      )}
      onClick={onSelect}
    >
      <td className="p-1.5">
        <QualityBadge quality={row.quality} />
      </td>
      <td className="p-1.5 font-mono tabular-nums text-ink-700 max-w-[120px] truncate">
        {row.channelRef}
      </td>
      <td className="p-1.5 font-mono tabular-nums">{row.register}</td>
      <td className="p-1.5 font-mono tabular-nums">{formatDisplayValue(row.raw)}</td>
      <td className="p-1.5 font-mono tabular-nums">
        {formatDecodedValue(row.decoded, row.quality)}
      </td>
      <td className="p-1.5 font-mono tabular-nums">{formatDisplayValue(row.suggestedTag)}</td>
      <td className="p-1.5 font-mono tabular-nums">{formatDisplayValue(row.boundTag)}</td>
      <td className="p-1.5 font-mono tabular-nums text-ink-700">{runtimeLabel}</td>
      <td className="p-1.5">
        <button
          type="button"
          className="text-accent hover:underline"
          onClick={(e) => {
            e.stopPropagation();
            onBind();
          }}
        >
          {hasPending ? "Edit" : "Bind"}
        </button>
      </td>
    </tr>
  );
}