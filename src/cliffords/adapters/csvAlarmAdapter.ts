import type { AdapterContext, AdapterInput, AdapterResult } from "./types.js";
import { parseStructuredTable } from "../parsers/parseStructuredTable.js";

export function parseCsvAlarm(
  input: AdapterInput,
  context: AdapterContext
): AdapterResult {
  const text = Buffer.from(input.bytes).toString("utf8");
  return {
    records: parseStructuredTable(text, input.artifact, context)
  };
}
