import { describe, expect, it } from "vitest";
import { gate1ArtifactIntegrity } from "../gates/gate1ArtifactIntegrity.js";
import { DEFAULT_CLIFFORD_CONFIG } from "../runtime.js";
import { MemoryRawArtifactStore } from "../stores/rawArtifactStore.js";
import type { RawArtifactStore } from "../contracts/plantModel.js";
import { fixedClock, sequentialIds } from "./testContext.js";

describe("Gate 1", () => {
  it("rejects empty input", async () => {
    const result = await gate1ArtifactIntegrity(
      { kind: "paste", text: "" },
      DEFAULT_CLIFFORD_CONFIG,
      new MemoryRawArtifactStore(),
      fixedClock(),
      sequentialIds()
    );

    expect(result.status).toBe("FAIL");
    if (result.status === "FAIL") {
      expect(result.quarantine.reason_code).toBe("EMPTY_INPUT");
    }
  });

  it("hashes, stores, and detects duplicate raw artifacts", async () => {
    const store = new MemoryRawArtifactStore();
    const clock = fixedClock();
    const ids = sequentialIds();
    const input = { kind: "paste", text: "operator note" } as const;

    const first = await gate1ArtifactIntegrity(
      input,
      DEFAULT_CLIFFORD_CONFIG,
      store,
      clock,
      ids
    );
    const second = await gate1ArtifactIntegrity(
      input,
      DEFAULT_CLIFFORD_CONFIG,
      store,
      clock,
      ids
    );

    expect(first.status).toBe("PASS");
    expect(second.status).toBe("PASS");
    if (first.status === "PASS" && second.status === "PASS") {
      expect(first.artifact.sha256).toHaveLength(64);
      expect(first.artifact.metadata.raw_duplicate).toBe(false);
      expect(second.artifact.metadata.raw_duplicate).toBe(true);
    }
    expect(store.size).toBe(1);
  });

  it("routes HAZOP-shaped CSV files to the HAZOP track", async () => {
    const result = await gate1ArtifactIntegrity(
      {
        kind: "file",
        filename: "hazop.csv",
        bytes: Buffer.from(
          "Deviation,Cause,Consequence,Safeguard\nHigh pressure,Valve closed,Rupture,Relief valve"
        )
      },
      DEFAULT_CLIFFORD_CONFIG,
      new MemoryRawArtifactStore(),
      fixedClock(),
      sequentialIds()
    );

    expect(result.status).toBe("PASS");
    if (result.status === "PASS") {
      expect(result.artifact.detected_type).toBe("hazop_worksheet");
    }
  });

  it("fails when the persisted raw copy does not match its digest", async () => {
    const corruptStore: RawArtifactStore = {
      put: async (sha256) => ({
        uri: `memory://raw/${sha256}`,
        duplicate: false
      }),
      get: async () => Buffer.from("corrupted")
    };

    const result = await gate1ArtifactIntegrity(
      { kind: "paste", text: "original" },
      DEFAULT_CLIFFORD_CONFIG,
      corruptStore,
      fixedClock(),
      sequentialIds()
    );

    expect(result.status).toBe("FAIL");
    if (result.status === "FAIL") {
      expect(result.quarantine.reason_code).toBe(
        "RAW_STORE_INTEGRITY_FAILED"
      );
    }
  });
});
