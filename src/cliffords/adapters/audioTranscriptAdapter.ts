import type { RawArtifact } from "../contracts/artifact.js";
import type {
  AdapterContext,
  AdapterInput,
  AdapterResult
} from "./types.js";
import { parseOperatorNote } from "../parsers/parseOperatorNote.js";

export type Transcript = {
  text: string;
  spans: Array<{ start_sec: number; end_sec: number; text: string }>;
  status: "COMPLETE" | "DEFERRED";
  confidence: number;
  deferred_reason: string | null;
};

export function transcribeAudio(_input: AdapterInput): Transcript {
  return {
    text: "",
    spans: [],
    status: "DEFERRED",
    confidence: 0,
    deferred_reason: "Audio transcription is deferred in V1"
  };
}

export function normalizeTranscript(transcript: Transcript): string {
  return transcript.text.replace(/\s+/g, " ").trim();
}

export function extractEventsFromTranscript(
  transcript: Transcript,
  artifact: RawArtifact,
  context: AdapterContext
): AdapterResult {
  const records = parseOperatorNote(
    normalizeTranscript(transcript),
    artifact,
    context
  ).map((record) => ({
    ...record,
    confidence: Math.min(record.confidence, 0.55)
  }));
  return { records };
}
