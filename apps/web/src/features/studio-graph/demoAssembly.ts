import sample from "../../../../../packages/sample-data/component-library/demo_motor_fan_blower_assembly.json";
import { plantAssemblySchema, type PlantAssembly } from "../../app/schemas/plantAssembly";
import { asDraft } from "./model/assemblyOps";

const COL = 320;
const ROW = 208;

/** Tidy left-to-right layout for the bench sample (grid-aligned: 320 and 208 are multiples of 16). */
const LAYOUT: Record<string, [col: number, row: number]> = {
  // power train
  dc_power_supply_1: [0, 0],
  fuse_protection_block_1: [1, 0],
  relay_contactor_1: [2, 0],
  dc_motor_12v_1: [3, 0],
  belt_coupling_1: [4, 0],
  // air path
  bldc_fan_1: [2, 1],
  industrial_blower_1: [4, 1],
  air_duct_1: [4, 2],
  airflow_sensor_1: [4, 3],
  // instrumentation → PLC
  current_sensor_1: [0, 1],
  voltage_sensor_1: [0, 2],
  temperature_sensor_1: [0, 3],
  plc_analog_input_module_1: [1, 2],
  rpm_tachometer_1: [3, 1],
  plc_digital_input_module_1: [3, 2],
  vibration_sensor_1: [2, 3],
};

/**
 * The bench sample (motor → belt → blower with sensor taps), laid out for Studio node sizes.
 * Loaded as drafts: approvals from the sample file are not carried over (R5).
 */
export function demoAssembly(plantId: string): PlantAssembly {
  const parsed = plantAssemblySchema.parse(sample);
  return asDraft(
    {
      ...parsed,
      assembly_id: `${plantId}_studio`,
      assets: parsed.assets.map((a) => {
        const cell = LAYOUT[a.asset_id];
        return cell ? { ...a, position_2d: { x: cell[0] * COL, y: cell[1] * ROW } } : a;
      }),
    },
    plantId,
  );
}
