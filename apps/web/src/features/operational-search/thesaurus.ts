/** Controlled alias map — explicit, deterministic, no runtime expansion. */
const ALIAS_MAP: Record<string, readonly string[]> = {
  motor: ["mtr", "drive"],
  mtr: ["motor", "drive"],
  drive: ["motor", "mtr"],
  battery: ["bms", "batt"],
  bms: ["battery", "batt"],
  batt: ["battery", "bms"],
  current: ["amp", "amps", "amperage"],
  amp: ["current", "amps", "amperage"],
  amps: ["current", "amp", "amperage"],
  amperage: ["current", "amp", "amps"],
  voltage: ["volt", "volts"],
  volt: ["voltage", "volts"],
  volts: ["voltage", "volt"],
  temperature: ["temp", "thermal"],
  temp: ["temperature", "thermal"],
  thermal: ["temperature", "temp"],
  vibration: ["vib"],
  vib: ["vibration"],
  alarm: ["alert", "trip", "fault"],
  alert: ["alarm", "trip", "fault"],
  trip: ["alarm", "alert", "fault"],
  fault: ["alarm", "alert", "trip"],
  root: ["cause"],
  cause: ["root"],
  critical: ["crit"],
  crit: ["critical"],
  warning: ["warn"],
  warn: ["warning"],
  sensor: ["tag", "signal"],
  tag: ["sensor", "signal"],
  signal: ["sensor", "tag"],
  quality: ["bad", "stale", "sensor"],
  bad: ["quality", "stale"],
  stale: ["quality", "bad"],
  blower: ["fan", "airflow"],
  fan: ["blower", "airflow"],
  airflow: ["blower", "fan"],
};

export function getAliasesForToken(token: string): string[] {
  const key = token.toLowerCase();
  const aliases = ALIAS_MAP[key];
  if (!aliases) return [];
  return [...aliases];
}

export function expandAliases(tokens: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];

  const add = (t: string) => {
    const key = t.toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(key);
  };

  for (const token of tokens) {
    add(token);
    for (const alias of getAliasesForToken(token)) {
      add(alias);
    }
  }

  return out;
}