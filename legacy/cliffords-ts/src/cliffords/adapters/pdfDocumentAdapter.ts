import type { RawArtifact, ArtifactType } from "../contracts/artifact.js";
import { detectDocumentKind } from "../detectors/detectDocumentKind.js";
import { parseOperatorNote } from "../parsers/parseOperatorNote.js";
import type {
  AdapterContext,
  AdapterInput,
  AdapterResult
} from "./types.js";

export type DocumentText = {
  pages: Array<{ page_number: number; text: string }>;
  status: "COMPLETE" | "DEFERRED";
  confidence: number;
  deferred_reason: string | null;
};

export function extractDocumentText(_input: AdapterInput): DocumentText {
  return {
    pages: [],
    status: "DEFERRED",
    confidence: 0,
    deferred_reason: "PDF extraction is deferred in V1"
  };
}

export function classifyDocumentKind(text: string): ArtifactType {
  return detectDocumentKind(text);
}

export function partitionDocument(
  text: string,
  artifact: RawArtifact,
  context: AdapterContext
): AdapterResult {
  return {
    records: parseOperatorNote(text, artifact, context).map((record) => ({
      ...record,
      confidence: Math.min(record.confidence, 0.5)
    }))
  };
}
