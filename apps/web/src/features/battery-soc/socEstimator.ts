import type {
  BatterySocConfig,
  BatterySocSample,
  CoulombHistoryPoint,
  SocReading,
} from "./socTypes";

const DIRECT_SOC_PATTERNS = [
  /^soc$/i,
  /^state_of_charge$/i,
  /^bat_soc$/i,
  /^bms_soc$/i,
  /^battery_soc$/i,
  /state.of.charge/i,
  /battery.*soc/i,
  /soc.*battery/i,
  /fuel.gauge/i,
];

const CURRENT_PATTERNS = [/current/i, /_i$/i, /\.current/i];

function isDirectSocTag(tagId: string, signalType?: string): boolean {
  const hay = `${tagId} ${signalType ?? ""}`;
  return DIRECT_SOC_PATTERNS.some((p) => p.test(tagId) || p.test(hay));
}

function isCurrentTag(tagId: string, signalType?: string, unit?: string): boolean {
  if (unit === "A") return true;
  const hay = `${tagId} ${signalType ?? ""}`;
  return CURRENT_PATTERNS.some((p) => p.test(hay));
}

function isVoltageTag(tagId: string, signalType?: string, unit?: string): boolean {
  if (unit === "V") return true;
  const hay = `${tagId} ${signalType ?? ""}`;
  return /voltage/i.test(hay) || /_v$/i.test(tagId);
}

function unavailable(warnings: string[], detail: string): SocReading {
  return {
    percent: null,
    confidence: "unavailable",
    source: "none",
    tag_id: null,
    quality: null,
    timestamp: null,
    warnings,
    detail,
  };
}

function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, value));
}

export function resolveDirectSoc(samples: BatterySocSample[]): SocReading | null {
  for (const sample of samples) {
    if (!isDirectSocTag(sample.tag_id, sample.signal_type)) continue;
    if (sample.value == null || Number.isNaN(sample.value)) {
      return unavailable(
        [`Direct SOC tag ${sample.tag_id} has no numeric value.`],
        "SOC unavailable — BMS tag present but value missing.",
      );
    }
    const warnings: string[] = [];
    if (sample.quality !== "GOOD") {
      warnings.push(`SOC tag quality is ${sample.quality}, not GOOD.`);
    }
    return {
      percent: clampPercent(sample.value),
      confidence: "reported",
      source: "bms_tag",
      tag_id: sample.tag_id,
      quality: sample.quality,
      timestamp: sample.timestamp,
      warnings,
      detail: "Reported by BMS/fuel gauge.",
    };
  }
  return null;
}

export function estimateCoulombSoc(
  samples: BatterySocSample[],
  config: BatterySocConfig,
  history: CoulombHistoryPoint[],
): SocReading | null {
  const warnings: string[] = [];
  if (config.capacity_Ah == null || config.capacity_Ah <= 0) {
    warnings.push("Missing battery capacity (Ah).");
  }
  if (config.initial_soc_percent == null) {
    warnings.push("Missing initial SOC percent.");
  }
  if (!config.current_sign) {
    warnings.push("Unknown charge/discharge current sign convention.");
  }
  const currentSample = samples.find((s) => isCurrentTag(s.tag_id, s.signal_type, s.unit));
  if (!currentSample) {
    warnings.push("Missing battery current tag.");
  } else if (currentSample.quality !== "GOOD") {
    warnings.push(`Battery current tag quality is ${currentSample.quality}.`);
  }

  if (warnings.length > 0) {
    return unavailable(warnings, "SOC unavailable — coulomb counting inputs incomplete.");
  }

  if (history.length < 2) {
    return unavailable(
      ["Need at least two timestamped current samples for coulomb integration."],
      "SOC unavailable — insufficient current history.",
    );
  }

  let soc = config.initial_soc_percent!;
  const sign = config.current_sign!;
  for (let i = 1; i < history.length; i += 1) {
    const prev = history[i - 1]!;
    const next = history[i]!;
    const t0 = Date.parse(prev.timestamp);
    const t1 = Date.parse(next.timestamp);
    if (Number.isNaN(t0) || Number.isNaN(t1)) {
      return unavailable(["Invalid timestamp in current history."], "SOC unavailable — bad timestamps.");
    }
    const dtHours = (t1 - t0) / 3_600_000;
    if (dtHours > 1) {
      warnings.push(`Gap of ${dtHours.toFixed(2)}h between samples — estimate may drift.`);
    }
    const deltaPercent = ((next.current_A * dtHours) / config.capacity_Ah!) * 100;
    soc += sign === "positive_charge" ? deltaPercent : -deltaPercent;
  }

  return {
    percent: clampPercent(soc),
    confidence: "estimated",
    source: "coulomb_count",
    tag_id: currentSample!.tag_id,
    quality: currentSample!.quality,
    timestamp: currentSample!.timestamp,
    warnings,
    detail:
      sign === "positive_charge"
        ? "Estimated via coulomb counting (positive current = charge)."
        : "Estimated via coulomb counting (positive current = discharge).",
  };
}

export function estimateOcvSoc(
  samples: BatterySocSample[],
  config: BatterySocConfig,
): SocReading | null {
  const warnings: string[] = [];
  if (!config.chemistry) warnings.push("Missing battery chemistry.");
  if (!config.ocv_table?.length) warnings.push("Missing OCV-to-SOC lookup table.");
  if (!config.ocv_rest_valid) warnings.push("No rest/no-load or OCV-valid flag — OCV correction not trusted.");
  const voltageSample = samples.find((s) => isVoltageTag(s.tag_id, s.signal_type, s.unit));
  if (!voltageSample) warnings.push("Missing battery voltage tag.");
  if (warnings.length > 0) {
    return unavailable(warnings, "SOC unavailable — OCV correction inputs incomplete.");
  }
  return unavailable(
    ["OCV interpolation not implemented without a validated lookup table match."],
    "SOC unavailable — voltage-only SoC is not supported for this chemistry.",
  );
}

export function resolveBatterySoc({
  assetType,
  samples,
  config = {},
  history = [],
}: {
  assetId: string;
  assetType: string;
  samples: BatterySocSample[];
  config?: BatterySocConfig;
  history?: CoulombHistoryPoint[];
}): SocReading {
  if (!assetType.includes("battery") && !assetType.includes("storage")) {
    return unavailable([], "SOC not applicable to this asset type.");
  }

  const direct = resolveDirectSoc(samples);
  if (direct) return direct;

  const coulomb = estimateCoulombSoc(samples, config, history);
  if (coulomb && coulomb.confidence === "estimated") return coulomb;

  const ocv = estimateOcvSoc(samples, config);
  if (ocv && ocv.confidence === "estimated") return ocv;

  const warnings = [
    ...(coulomb?.warnings ?? []),
    ...(ocv?.warnings ?? []),
    "No direct BMS/fuel-gauge SOC tag found.",
    "Voltage-only SoC is not used without chemistry-specific OCV table.",
  ];

  return unavailable(
    [...new Set(warnings)],
    "SOC unavailable — missing required authored inputs.",
  );
}