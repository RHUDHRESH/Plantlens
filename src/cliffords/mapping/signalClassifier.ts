export type SignalClassification = {
  signal_type: string | null;
  confidence: number;
};

export function classifySignal(
  tagId: string,
  message: string | null,
  unit: string | null
): SignalClassification {
  const text = `${tagId} ${message ?? ""}`.toUpperCase();
  const candidates: Array<[RegExp, string]> = [
    [/TEMP|TEMPERATURE|DEGC|DEGF/, "temperature"],
    [/CURRENT|\bA\b/, "current"],
    [/VOLT|VOLTAGE|\bV\b/, "voltage"],
    [/POWER|KW/, "power"],
    [/PRESSURE|BAR|PSI/, "pressure"],
    [/SPEED|RPM/, "speed"],
    [/FLOW|L\/MIN/, "flow"]
  ];
  const match = candidates.find(([pattern]) =>
    pattern.test(`${text} ${unit ?? ""}`)
  );
  return match
    ? { signal_type: match[1], confidence: 0.8 }
    : { signal_type: null, confidence: 0 };
}
