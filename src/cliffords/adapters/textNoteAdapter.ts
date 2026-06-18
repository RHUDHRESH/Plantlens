import type { AdapterContext, AdapterInput, AdapterResult } from "./types.js";
import { parseOperatorNote } from "../parsers/parseOperatorNote.js";

export function parseTextNote(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  const text = Buffer.from(input.bytes).toString("utf8").trim();
  return {
    records: parseOperatorNote(text, input.artifact, context)
  };
}
