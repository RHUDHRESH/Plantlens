import { renderCausalGraph, chainToGraphNodes } from "./causal-graph.js";

const STEPS = [
  { id: "upload", label: "Upload", hint: "Add files", title: "Upload files", desc: "Add your evidence files to begin.", next: "Continue" },
  { id: "confirm", label: "Confirm", hint: "Review files", title: "Confirm files", desc: "Review your files before processing.", next: "Start processing" },
  { id: "parse", label: "Parse", hint: "Extract data", title: "Parse & OCR", desc: "Extract and structure your data.", next: "Continue" },
  { id: "validate", label: "Validate", hint: "Check quality", title: "Validate", desc: "Verify data passes quality gates.", next: "Continue" },
  { id: "quarantine", label: "Quarantine", hint: "Review issues", title: "Quarantine", desc: "Review and decide on flagged records.", next: "Continue" },
  { id: "approve", label: "Approve", hint: "Map tags", title: "Approve mappings", desc: "Approve tag mapping suggestions.", next: "Continue" },
  { id: "timeline", label: "Timeline", hint: "View events", title: "Timeline", desc: "See alarms in chronological order.", next: "Continue" },
  { id: "diagnose", label: "Diagnose", hint: "Find cause", title: "Diagnose", desc: "Identify root cause from the alarm sequence.", next: "Run diagnosis" },
  { id: "report", label: "Report", hint: "Export", title: "Report", desc: "Export your evidence pack.", next: "Start new run" }
];

const ASSETS = {
  PV101_IRRADIANCE_LOW: "PV Array",
  PV101_CURRENT_LOW: "PV String",
  MPPT101_POWER_LIMIT: "MPPT",
  BAT101_DISCHARGE_HIGH: "Battery",
  DCBUS101_VOLTAGE_LOW: "DC Bus"
};

const CHAIN = [
  { tag: "PV101_IRRADIANCE_LOW", label: "PV irradiance low", asset: "PV Array" },
  { tag: "PV101_CURRENT_LOW", label: "PV current low", asset: "PV String" },
  { tag: "MPPT101_POWER_LIMIT", label: "MPPT limiting", asset: "MPPT" },
  { tag: "DCBUS101_VOLTAGE_LOW", label: "DC bus low", asset: "DC Bus" },
  { tag: "BAT101_DISCHARGE_HIGH", label: "Battery discharge high", asset: "Battery" }
];

const SAMPLES = {
  alarmCsv: {
    filename: "sample_alarm_history.csv",
    mime: "text/csv",
    text: `Timestamp,TagName,Priority,State,Value,Unit,Message
2026-06-15 10:00:00,PV101_IRRADIANCE_LOW,HIGH,ACTIVE,180,W/m2,PV irradiance below expected level
2026-06-15 10:00:04,PV101_CURRENT_LOW,HIGH,ACTIVE,1.2,A,PV string current low
2026-06-15 10:00:12,MPPT101_POWER_LIMIT,MEDIUM,ACTIVE,45,%,MPPT limiting output power
2026-06-15 10:00:25,BAT101_DISCHARGE_HIGH,HIGH,ACTIVE,18,A,Battery discharge current high
2026-06-15 10:00:41,DCBUS101_VOLTAGE_LOW,HIGH,ACTIVE,10.8,V,DC bus voltage low`
  },
  badCsv: {
    filename: "sample_bad_alarm_history.csv",
    mime: "text/csv",
    text: `Time,Alarm,Severity,Status,PV,EU,Text
not-a-date,PVI0I_CURRNT_LOW,banana,ON,999999,meters,broken messy row
2026-06-15 10:00:04,UNKNOWN_TAG,HIGH,ACTIVE,1.2,A,unknown tag should quarantine`
  },
  matrixCsv: {
    filename: "sample_cause_effect_matrix.csv",
    mime: "text/csv",
    text: `Cause,Effect,MinDelaySec,MaxDelaySec,Source
PV101_IRRADIANCE_LOW,PV101_CURRENT_LOW,0,8,manual_demo
PV101_CURRENT_LOW,MPPT101_POWER_LIMIT,2,20,manual_demo`
  }
};

const state = {
  step: "upload",
  files: [],
  activeId: null,
  confirmed: false,
  result: null,
  diagnosis: null,
  log: [],
  ocr: "pending",
  quarantine: {},
  approvals: {},
  busy: false
};

const $ = (s) => document.querySelector(s);
const els = {
  stepsNav: $("#stepsNav"),
  stepTitle: $("#stepTitle"),
  stepDesc: $("#stepDesc"),
  stepContent: $("#stepContent"),
  backBtn: $("#backBtn"),
  nextBtn: $("#nextBtn"),
  fileList: $("#fileList"),
  fileCount: $("#fileCount"),
  fileInput: $("#fileInput"),
  rawEditor: $("#rawEditor"),
  timezoneInput: $("#timezoneInput"),
  runIdDisplay: $("#runIdDisplay"),
  statusBadge: $("#statusBadge")
};

const $$ = (s, r = document) => [...r.querySelectorAll(s)];

const esc = (v) => String(v ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const stepIdx = (id) => STEPS.findIndex((s) => s.id === id);
const step = (id) => STEPS.find((s) => s.id === id) || STEPS[0];
const unlocked = (id) => stepIdx(id) <= stepIdx(state.step);

function setStatus(text, status = "idle") {
  els.statusBadge.textContent = text;
  els.statusBadge.dataset.status = status;
}

function setRunId(id) {
  els.runIdDisplay.textContent = id ? id.slice(0, 24) + "…" : "No run yet";
}

function fmtBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
}

function ext(name) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toUpperCase().slice(0, 4) : "FILE";
}

function uid() {
  return `f-${Math.random().toString(36).slice(2, 9)}`;
}

function needsOcr(name) {
  return /\.(pdf|png|jpe?g|tiff)$/i.test(name);
}

function b64(text) {
  const b = new Uint8Array(new TextEncoder().encode(text));
  let s = "";
  for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000));
  return btoa(s);
}

function activeFile() {
  return state.files.find((f) => f.id === state.activeId) || state.files[0];
}

function asset(tag) {
  if (ASSETS[tag]) return ASSETS[tag];
  const u = String(tag).toUpperCase();
  if (u.includes("IRRAD")) return "PV Array";
  if (u.includes("PV")) return "PV String";
  if (u.includes("MPPT")) return "MPPT";
  if (u.includes("BAT")) return "Battery";
  if (u.includes("DCBUS")) return "DC Bus";
  return "Unmapped";
}

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const h = lines[0].split(",").map((x) => x.trim());
  return lines.slice(1).map((line) => {
    const v = line.split(",").map((x) => x.trim());
    const row = Object.fromEntries(h.map((k, i) => [k, v[i] ?? ""]));
    const tag = row.TagName || row.Alarm || row.tag || "—";
    return { time: row.Timestamp || row.Time || "—", tag, asset: asset(tag), msg: row.Message || row.Text || "—", pri: row.Priority || row.Severity || "—" };
  });
}

function alarms(records) {
  return (records || [])
    .filter((r) => r.record_type === "alarm_event")
    .map((r) => ({
      time: String(r.timestamp_utc || "").match(/\d{2}:\d{2}:\d{2}/)?.[0] || "—",
      tag: r.tag_id,
      asset: asset(r.tag_id),
      msg: r.alarm_message || "—",
      pri: `P${r.priority || "?"}`
    }))
    .sort((a, b) => a.time.localeCompare(b.time));
}

function pill(status) {
  if (status === "PASS" || status === "accept" || status === "confirmed") return "success";
  if (status === "FAIL" || status === "reject") return "danger";
  return "warning";
}

function renderSteps() {
  const cur = stepIdx(state.step);
  els.stepsNav.innerHTML = STEPS.map((s, i) => {
    const cls = i < cur ? "is-done" : i === cur ? "is-active" : "";
    return `<button type="button" class="step-item ${cls}" data-step="${s.id}" ${unlocked(s.id) ? "" : "disabled"}>
      <span class="step-item__num">${i + 1}</span>
      <span class="step-item__text">
        <span class="step-item__label">${s.label}</span>
        <span class="step-item__hint">${s.hint}</span>
      </span>
    </button>`;
  }).join("");
  $$(".step-item", els.stepsNav).forEach((btn) => {
    btn.addEventListener("click", () => { if (unlocked(btn.dataset.step)) goTo(btn.dataset.step); });
  });
}

function renderFiles() {
  els.fileCount.textContent = String(state.files.length);
  if (!state.files.length) {
    els.fileList.innerHTML = `<li class="file-list__empty">No files yet</li>`;
    return;
  }
  els.fileList.innerHTML = state.files.map((f) => `
    <li class="file-item${f.id === state.activeId ? " is-active" : ""}${f.confirmed ? " is-confirmed" : ""}" data-id="${f.id}">
      <span class="file-item__icon">${esc(ext(f.name))}</span>
      <span class="file-item__info">
        <span class="file-item__name">${esc(f.name)}</span>
        <span class="file-item__size">${fmtBytes(f.size)}</span>
      </span>
      <button type="button" class="file-item__remove" data-rm="${f.id}" aria-label="Remove">×</button>
    </li>`).join("");

  $$(".file-item", els.fileList).forEach((li) => {
    li.addEventListener("click", (e) => {
      if (e.target.closest("[data-rm]")) return;
      state.activeId = li.dataset.id;
      const f = activeFile();
      if (f) els.rawEditor.value = f.text;
      renderFiles();
    });
  });
  $$("[data-rm]", els.fileList).forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const id = btn.dataset.rm;
      state.files = state.files.filter((f) => f.id !== id);
      if (state.activeId === id) state.activeId = state.files[0]?.id || null;
      renderFiles();
      renderContent();
    });
  });
}

async function addFiles(list) {
  for (const file of list) {
    const text = await file.text().catch(() => "");
    state.files.push({ id: uid(), name: file.name, mime: file.type || "application/octet-stream", size: file.size, text, confirmed: false, needsOcr: needsOcr(file.name) });
    if (!state.activeId) state.activeId = state.files[state.files.length - 1].id;
  }
  const f = activeFile();
  if (f) els.rawEditor.value = f.text;
  renderFiles();
  renderContent();
}

function loadSample(key) {
  const s = SAMPLES[key];
  if (!s) return;
  state.files = [{ id: uid(), name: s.filename, mime: s.mime, size: new TextEncoder().encode(s.text).length, text: s.text, confirmed: false, needsOcr: false }];
  state.activeId = state.files[0].id;
  state.result = null;
  state.diagnosis = null;
  state.confirmed = false;
  state.quarantine = {};
  state.approvals = {};
  state.log = [];
  els.rawEditor.value = s.text;
  setRunId(null);
  setStatus("Idle", "idle");
  renderFiles();
  goTo("upload");
}

function confirmAll() {
  state.files.forEach((f) => { f.confirmed = true; });
  state.confirmed = true;
  renderFiles();
}

async function runParse() {
  const f = activeFile();
  if (!f) throw new Error("No file selected");
  state.busy = true;
  state.log = [];
  state.ocr = f.needsOcr ? "running" : "skipped";
  renderContent();
  renderSteps();

  const addLog = (msg) => { state.log.push(msg); renderContent(); };
  addLog(`Reading ${f.name}…`);
  await wait(300);
  if (f.needsOcr) { addLog("OCR deferred (V1)"); state.ocr = "deferred"; }
  else { addLog("OCR skipped — structured file"); state.ocr = "skipped"; }
  addLog("Running Cliffords pipeline…");

  const res = await fetch("/api/run", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ plant_timezone: els.timezoneInput.value, input: { kind: "file", filename: f.name, mime_type: f.mime, bytes_base64: b64(f.text) } })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Parse failed");

  state.result = data;
  const r = data.result;
  setRunId(r.run_id);
  addLog(`Done: ${r.report.totals.parsed} parsed, ${r.report.totals.clean} clean, ${r.report.totals.quarantined} quarantined`);
  r.quarantined_records.forEach((_, i) => { state.quarantine[`q-${i}`] = "pending"; });
  r.mapping_requests.forEach((_, i) => { state.approvals[`m-${i}`] = false; });
  state.busy = false;
  setStatus("Processed", "running");
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* Step content */
function renderUpload() {
  return `
    <div class="upload" id="uploadZone">
      <p class="upload__title">Drop files here</p>
      <p class="upload__text">or click to browse · CSV, JSON, alarm exports</p>
      <button type="button" class="btn btn--secondary" id="browseBtn">Browse files</button>
    </div>
    <div class="samples">
      <span class="samples__label">Try a sample:</span>
      <button type="button" class="btn btn--secondary btn--sm" data-sample="alarmCsv">Alarm CSV</button>
      <button type="button" class="btn btn--secondary btn--sm" data-sample="badCsv">Bad CSV</button>
      <button type="button" class="btn btn--secondary btn--sm" data-sample="matrixCsv">Matrix</button>
    </div>`;
}

function renderConfirm() {
  const rows = state.files.map((f) => `<tr>
    <td>${esc(f.name)}</td><td>${fmtBytes(f.size)}</td>
    <td>${f.needsOcr ? '<span class="pill pill--warning">OCR deferred</span>' : '<span class="pill pill--neutral">Direct</span>'}</td>
    <td>${f.confirmed ? '<span class="pill pill--success">Confirmed</span>' : '<span class="pill pill--warning">Pending</span>'}</td>
  </tr>`).join("");
  return `
    <div class="alert alert--info">Active file: <strong>${esc(activeFile()?.name || "—")}</strong> — this is the file that will be processed.</div>
    <div class="table-wrap"><table class="table"><thead><tr><th>File</th><th>Size</th><th>Method</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p style="margin-top:16px"><button type="button" class="btn btn--secondary btn--sm" id="confirmAllBtn">Confirm all files</button></p>`;
}

function renderParse() {
  const r = state.result?.result;
  const ocr = { pending: "Pending", running: "Running…", skipped: "Skipped", deferred: "Deferred" }[state.ocr] || state.ocr;
  return `
    <div class="stats">
      <div class="stat"><span class="stat__label">OCR</span><span class="stat__value" style="font-size:16px">${ocr}</span></div>
      <div class="stat"><span class="stat__label">Adapter</span><span class="stat__value" style="font-size:14px">${esc(r?.artifact?.detected_type || "—")}</span></div>
      <div class="stat"><span class="stat__label">Records</span><span class="stat__value">${r?.report?.totals?.parsed ?? (state.busy ? "…" : "—")}</span></div>
    </div>
    <ul class="log">${state.log.map((l) => `<li>${esc(l)}</li>`).join("") || "<li>Click Continue to start processing</li>"}</ul>`;
}

function renderValidate() {
  const r = state.result?.result;
  if (!r) return `<div class="alert alert--danger">Run parse first.</div>`;
  const gates = [
    { name: "File integrity", g: r.report.gate_1 },
    { name: "Schema check", g: r.report.gate_2 },
    { name: "Industrial truth", g: r.report.gate_3 }
  ];
  const allPass = gates.every((x) => x.g.status === "PASS");
  return `
    <div class="alert alert--${allPass ? "success" : "warning"}">${allPass ? "All gates passed." : "Some records were rejected — review quarantine next."}</div>
    <div class="gates">${gates.map((x) => {
      const p = pill(x.g.status);
      return `<div class="gate gate--${p === "success" ? "pass" : p}">
        <p class="gate__name">${x.name}</p>
        <span class="pill pill--${p}">${x.g.status}</span>
        <p class="gate__detail">${x.g.accepted} accepted · ${x.g.rejected} rejected</p>
      </div>`;
    }).join("")}</div>`;
}

function renderQuarantine() {
  const recs = state.result?.result?.quarantined_records || [];
  if (!recs.length) return `<div class="alert alert--success">No quarantined records. You're good to proceed.</div>`;
  const rows = recs.map((q, i) => {
    const k = `q-${i}`;
    const d = state.quarantine[k] || "pending";
    return `<tr>
      <td><code>${esc(q.reason_code)}</code></td>
      <td>${esc(q.reason_message)}</td>
      <td>${esc(q.gate)}</td>
      <td><div class="decisions">
        <button type="button" class="btn btn--secondary btn--sm q-btn${d === "accept" ? " is-selected" : ""}" data-k="${k}" data-dec="accept">Accept</button>
        <button type="button" class="btn btn--secondary btn--sm q-btn${d === "reject" ? " is-selected" : ""}" data-k="${k}" data-dec="reject">Reject</button>
      </div></td>
    </tr>`;
  }).join("");
  return `
    <div class="table-wrap"><table class="table"><thead><tr><th>Code</th><th>Message</th><th>Gate</th><th>Decision</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderApprove() {
  const maps = state.result?.result?.mapping_requests || [];
  if (!maps.length) return `<div class="alert alert--success">All tags mapped. Nothing to approve.</div>`;
  const rows = maps.map((m, i) => {
    const k = `m-${i}`;
    const ok = state.approvals[k];
    return `<tr>
      <td>${esc(m.issue)}</td>
      <td><code>${esc(m.raw_value)}</code></td>
      <td>${(m.suggested_matches || []).map((s) => esc(s.label || s.id)).join(", ") || "—"}</td>
      <td><button type="button" class="btn btn--secondary btn--sm m-btn${ok ? " is-selected" : ""}" data-k="${k}">${ok ? "Approved" : "Approve"}</button></td>
    </tr>`;
  }).join("");
  return `
    <div class="toolbar"><span></span><button type="button" class="btn btn--secondary btn--sm" id="approveAllBtn">Approve all</button></div>
    <div class="table-wrap"><table class="table"><thead><tr><th>Issue</th><th>Raw value</th><th>Suggestion</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderTimeline() {
  const ev = state.result ? alarms(state.result.result.clean_records) : parseCsv(activeFile()?.text || "");
  if (!ev.length) return `<div class="alert alert--warning">No events to show.</div>`;
  const rows = ev.map((e, i) => `<tr>
    <td>${esc(e.time)}</td>
    <td><strong>${esc(e.asset)}</strong>${i === 0 ? ' <span class="pill pill--warning">First</span>' : ""}</td>
    <td>${esc(e.msg)}</td>
    <td>${esc(e.pri)}</td>
  </tr>`).join("");
  return `<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Asset</th><th>Alarm</th><th>Priority</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function buildDiagnosis() {
  const r = state.result.result;
  const ev = alarms(r.clean_records);
  const tags = ev.map((e) => String(e.tag).toUpperCase());
  let chain = CHAIN.filter((s) => tags.includes(s.tag));
  if (chain.length < 2) chain = ev.map((e) => ({ label: e.msg, asset: e.asset, tag: e.tag }));
  const root = chain[0]?.tag?.includes("IRRADIANCE") ? "PV generation loss / low irradiance" : chain[0]?.label || "Unknown";
  const bat = tags.includes("BAT101_DISCHARGE_HIGH");
  return {
    root,
    conf: 0.82,
    chain,
    ev,
    tips: ["Inspect PV input and irradiance sensors first.", "Check MPPT behavior before power electronics.", bat ? "Battery is likely reacting — don't replace it first." : "Verify DC bus loading."],
    bat
  };
}

function renderDiagnose() {
  if (!state.diagnosis) return `<div class="alert alert--info">Click "Run diagnosis" to analyze the alarm sequence.</div>`;
  const d = state.diagnosis;
  return `
    <div class="verdict">
      <p class="verdict__label">Root cause</p>
      <p class="verdict__title">${esc(d.root)}</p>
      <p class="verdict__meta">${Math.round(d.conf * 100)}% confidence · ${d.ev.length} alarms analyzed</p>
      ${d.bat ? '<p class="verdict__warning">Battery discharge is a downstream effect — fix upstream causes first.</p>' : ""}
    </div>
    <p style="font-size:13px;font-weight:600;color:var(--text-secondary);margin-bottom:8px">Causal chain</p>
    <div id="graphWrap" class="graph-wrap"></div>
    <ul class="actions-list">${d.tips.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
}

function renderReport() {
  const d = state.diagnosis;
  const r = state.result?.result;
  if (!d || !r) return `<div class="alert alert--danger">Complete diagnosis first.</div>`;
  const pack = { run_id: r.run_id, file: activeFile()?.name, root_cause: d.root, confidence: d.conf, alarms: d.ev.length, quarantined: r.report.totals.quarantined };
  return `
    <pre class="report-pre">${esc(JSON.stringify(pack, null, 2))}</pre>
    <div style="display:flex;gap:12px">
      <button type="button" class="btn btn--primary btn--sm" id="copyBtn">Copy summary</button>
      <button type="button" class="btn btn--secondary btn--sm" id="exportBtn">Download JSON</button>
    </div>`;
}

const RENDER = {
  upload: renderUpload,
  confirm: renderConfirm,
  parse: renderParse,
  validate: renderValidate,
  quarantine: renderQuarantine,
  approve: renderApprove,
  timeline: renderTimeline,
  diagnose: renderDiagnose,
  report: renderReport
};

function renderContent() {
  const s = step(state.step);
  els.stepTitle.textContent = s.title;
  els.stepDesc.textContent = s.desc;
  els.stepContent.innerHTML = RENDER[state.step]();
  els.backBtn.disabled = stepIdx(state.step) === 0 || state.busy;
  els.nextBtn.textContent = state.busy ? "Processing…" : s.next;
  els.nextBtn.disabled = state.busy || (state.step === "upload" && !state.files.length);
  bind();
  if (state.step === "diagnose" && state.diagnosis) {
    renderCausalGraph($("#graphWrap"), chainToGraphNodes(state.diagnosis.chain, state.diagnosis.ev));
  }
  renderSteps();
}

function bind() {
  const zone = $("#uploadZone");
  zone?.addEventListener("click", (e) => { if (!e.target.closest("#browseBtn")) els.fileInput.click(); });
  zone?.addEventListener("dragover", (e) => { e.preventDefault(); zone.classList.add("is-dragover"); });
  zone?.addEventListener("dragleave", () => zone.classList.remove("is-dragover"));
  zone?.addEventListener("drop", async (e) => { e.preventDefault(); zone.classList.remove("is-dragover"); if (e.dataTransfer.files.length) await addFiles(e.dataTransfer.files); });
  $("#browseBtn")?.addEventListener("click", (e) => { e.stopPropagation(); els.fileInput.click(); });
  $$("[data-sample]").forEach((b) => b.addEventListener("click", () => loadSample(b.dataset.sample)));
  $("#confirmAllBtn")?.addEventListener("click", confirmAll);
  $$(".q-btn").forEach((b) => b.addEventListener("click", () => { state.quarantine[b.dataset.k] = b.dataset.dec; renderContent(); }));
  $$(".m-btn").forEach((b) => b.addEventListener("click", () => { state.approvals[b.dataset.k] = !state.approvals[b.dataset.k]; renderContent(); }));
  $("#approveAllBtn")?.addEventListener("click", () => { Object.keys(state.approvals).forEach((k) => { state.approvals[k] = true; }); renderContent(); });
  $("#copyBtn")?.addEventListener("click", copySummary);
  $("#exportBtn")?.addEventListener("click", exportJson);
}

function goTo(id) {
  state.step = id;
  renderContent();
}

async function onNext() {
  const i = stepIdx(state.step);
  const next = STEPS[i + 1];

  if (state.step === "upload") {
    if (!state.files.length) return;
    goTo("confirm");
    return;
  }
  if (state.step === "confirm") {
    if (!state.confirmed) confirmAll();
    goTo("parse");
    try {
      await runParse();
      goTo("validate");
      setStatus("Validated", "running");
    } catch (e) {
      setStatus("Error", "error");
      els.stepContent.innerHTML = `<div class="alert alert--danger">${esc(e.message)}</div>`;
    }
    return;
  }
  if (state.step === "parse" && !state.result) {
    try { await runParse(); } catch (e) { setStatus("Error", "error"); return; }
  }
  if (state.step === "diagnose" && !state.diagnosis) {
    state.diagnosis = buildDiagnosis();
    setStatus("Complete", "done");
    renderContent();
    return;
  }
  if (state.step === "report") {
    reset();
    return;
  }
  if (next) goTo(next.id);
}

function onBack() {
  const i = stepIdx(state.step);
  if (i > 0) goTo(STEPS[i - 1].id);
}

function reset() {
  state.step = "upload";
  state.files = [];
  state.activeId = null;
  state.confirmed = false;
  state.result = null;
  state.diagnosis = null;
  state.log = [];
  state.quarantine = {};
  state.approvals = {};
  els.rawEditor.value = "";
  setRunId(null);
  setStatus("Idle", "idle");
  renderFiles();
  renderContent();
}

async function copySummary() {
  if (!state.diagnosis) return;
  const t = `Root cause: ${state.diagnosis.root}\nConfidence: ${Math.round(state.diagnosis.conf * 100)}%`;
  try { await navigator.clipboard.writeText(t); } catch { /* noop */ }
}

function exportJson() {
  if (!state.result || !state.diagnosis) return;
  const blob = new Blob([JSON.stringify({ run_id: state.result.result.run_id, diagnosis: state.diagnosis }, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "evidence-pack.json";
  a.click();
}

els.fileInput.addEventListener("change", async () => {
  if (els.fileInput.files?.length) await addFiles(els.fileInput.files);
  els.fileInput.value = "";
});
els.nextBtn.addEventListener("click", onNext);
els.backBtn.addEventListener("click", onBack);
els.runIdDisplay.addEventListener("click", async () => {
  const id = state.result?.result?.run_id;
  if (id) try { await navigator.clipboard.writeText(id); } catch { /* noop */ }
});

renderSteps();
renderFiles();
loadSample("alarmCsv");