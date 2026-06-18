import type { AdapterInput } from "./types.js";

export type OcrResult = {
  text: string;
  confidence: number;
  status: "COMPLETE" | "DEFERRED";
  deferred_reason: string | null;
};

export function runOcrIfNeeded(_input: AdapterInput): OcrResult {
  return {
    text: "",
    confidence: 0,
    status: "DEFERRED",
    deferred_reason: "OCR extraction is deferred in V1"
  };
}
