import { describe, expect, it } from "vitest";
import { canReview, consequences, countOps, explainReviewError, validateReview } from "./reviewModel";
import { makeChange } from "./testUtils";

describe("validateReview", () => {
  it("requires a decision and a comment", () => {
    expect(validateReview({ decision: null, comment: "", approveEdges: true })).toEqual({
      decision: expect.any(String),
      comment: expect.stringMatching(/required/),
    });
    expect(validateReview({ decision: "approve", comment: "   ", approveEdges: true }).comment).toMatch(/required/);
    expect(validateReview({ decision: "reject", comment: "ok", approveEdges: true }).comment).toMatch(/few words/);
    expect(validateReview({ decision: "approve", comment: "Checked P&ID", approveEdges: true })).toEqual({});
  });
});

describe("canReview", () => {
  it("allows only engineers/admins on pending changes", () => {
    const pending = makeChange();
    expect(canReview("engineer", pending).allowed).toBe(true);
    expect(canReview("admin", pending).allowed).toBe(true);
    expect(canReview("operator", pending)).toEqual({ allowed: false, reason: expect.stringMatching(/Only engineers/) });
    expect(canReview("viewer", pending).allowed).toBe(false);
    expect(canReview("engineer", makeChange({ status: "deployed" })).reason).toMatch(/deployed/);
  });
});

describe("consequences", () => {
  const change = makeChange();
  it("names the next revision and whether edges are admitted", () => {
    const lines = consequences({ decision: "approve", comment: "x", approveEdges: true }, change, 2);
    expect(lines[0]).toMatch(/Creates revision r3 and hot-deploys it/);
    expect(lines.join(" ")).toMatch(/1 alarm rule, 1 causal edge/);
    expect(lines.join(" ")).toMatch(/admitted .*flagged feedback loop/);
    const off = consequences({ decision: "approve", comment: "x", approveEdges: false }, change, 2);
    expect(off.join(" ")).toMatch(/stored unapproved/);
  });
  it("reject never touches the runtime", () => {
    expect(consequences({ decision: "reject", comment: "x", approveEdges: true }, change, 2)[0]).toMatch(/Nothing reaches the runtime/);
  });
  it("counts ops", () => {
    expect(countOps(change)).toEqual({ alarmRules: 1, edges: 1, loops: 1, nodes: 0, situations: 0 });
  });
});

describe("explainReviewError", () => {
  it("explains four-eyes refusals", () => {
    const e = explainReviewError({ status: 403, body: { message: "Four-eyes policy: the author cannot review their own change" } });
    expect(e.kind).toBe("four_eyes");
    expect(e.fix).toMatch(/another engineer/);
  });
  it("explains stale refusals with revisions", () => {
    const e = explainReviewError({ status: 409, body: { message: "Change was drafted against an older revision", base_rev: 1, current_rev: 3 } });
    expect(e.kind).toBe("stale");
    expect(e.message).toMatch(/r1.*r3/);
    expect(e.fix).toMatch(/Re-submit/);
  });
  it("explains validation failures", () => {
    expect(explainReviewError({ status: 422, body: { message: "Resulting bundle fails validation" } }).kind).toBe("invalid");
  });
});
