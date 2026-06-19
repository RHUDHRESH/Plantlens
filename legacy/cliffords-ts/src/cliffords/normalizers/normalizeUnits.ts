import { normalizeText } from "./normalizeText.js";

const UNIT_ALIASES = new Map<string, string>([
  ["c", "degC"],
  ["°c", "degC"],
  ["degc", "degC"],
  ["f", "degF"],
  ["°f", "degF"],
  ["degf", "degF"],
  ["a", "A"],
  ["amp", "A"],
  ["amps", "A"],
  ["v", "V"],
  ["volt", "V"],
  ["volts", "V"],
  ["kw", "kW"],
  ["rpm", "rpm"],
  ["lpm", "L/min"],
  ["l/min", "L/min"],
  ["bar", "bar"],
  ["psi", "psi"],
  ["%", "%"],
  ["w/m2", "W/m2"],
  ["w/m²", "W/m2"]
]);

export function normalizeUnits(value: unknown): string | null {
  const text = normalizeText(value);
  if (!text) {
    return null;
  }
  return UNIT_ALIASES.get(text.toLowerCase()) ?? text;
}
