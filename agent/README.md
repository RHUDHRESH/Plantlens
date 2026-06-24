# PlantLens Copilot Agent

Read-only AI copilot (Domain Q). Bound **only** to the read-only REST/MCP tool
surface in `backend/app/api/agent_tools.py`. Architecturally write-proof: there
is no write path to bind to, so prompt-injection cannot escalate (IEC 62443).

## Operating contracts (enforced in the system prompt)
1. **Cite-or-silent** — every factual claim ties to a signal_id + ts + value it
   actually read via the tools. No citation, no claim.
2. **Narrates, never diagnoses** — explains the deterministic engine's output;
   it does not produce its own diagnoses. The engine is ground truth.
3. **Never computes AVAILABLE** — reads the pre-computed Action Envelope only;
   forbidden from evaluating action safety itself.
4. **Freshness stamp** on every answer; bad-quality signals force "this sensor is
   unreliable" instead of reading through them.
5. **Log pass-through** — logs come from the audit ledger, never fabricated.
6. **Agent transcripts audited** — what was asked, read, said is written to the ledger.

## Two modes
- **Runtime** — "what's wrong with M-101", "get me the last hour of blower current",
  "why did you group these alarms", "anything abnormal last shift". Pull-only at the
  Calm Card moment (Q12 decision: locked).
- **Authoring** — "make a pump with standard signals", "propose edges from this matrix",
  "draft the fault modes". Writes to model files through validation; for the DAG,
  through the engineer gate. Same proposer role as the offline miners.
