export type SocConfidence = "reported" | "estimated" | "unavailable";

export type SocSource = "bms_tag" | "coulomb_count" | "ocv" | "none";

export interface BatterySocConfig {
  capacity_Ah?: number;
  initial_soc_percent?: number;
  /** Positive current means discharge (subtract delta) or charge (add delta). */
  current_sign?: "positive_discharge" | "positive_charge";
  chemistry?: string;
  ocv_table?: Array<{ voltage_v: number; soc_percent: number }>;
  ocv_rest_valid?: boolean;
}

export interface BatterySocSample {
  tag_id: string;
  value: number | null;
  unit: string;
  quality: string;
  timestamp: string;
  signal_type?: string;
}

export interface CoulombHistoryPoint {
  current_A: number;
  timestamp: string;
}

export interface SocReading {
  percent: number | null;
  confidence: SocConfidence;
  source: SocSource;
  tag_id: string | null;
  quality: string | null;
  timestamp: string | null;
  warnings: string[];
  detail: string;
}