/** Mirror of packages/contracts/fault_matrix.schema.json (+ score overlay). */

export type ExpectedDirection = "HIGH" | "LOW" | "RISING" | "FALLING" | "TRUE" | "FALSE";

export interface FaultSymptom {
  tag_id: string;
  expected_direction: ExpectedDirection;
  weight: number;
  required: boolean;
}

export interface FaultDef {
  id: string;
  name: string;
  asset_id: string;
  symptoms: FaultSymptom[];
  description?: string | null;
  situation_type?: string | null;
  safe_action_id?: string | null;
}

export interface FaultMatrix {
  version: string;
  matrix_id: string;
  faults: FaultDef[];
}

export interface FaultMatrixScore {
  fault_id: string;
  fault_name: string;
  asset_id: string;
  confidence: number;
  coverage: number;
  contradicted: boolean;
  situation_type?: string | null;
  safe_action_id?: string | null;
  supporting_symptoms?: string[];
  contradicting_symptoms?: string[];
  missing_symptoms?: string[];
}
