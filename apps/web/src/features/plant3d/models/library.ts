import type { ComponentType } from "react";
import type { ModelKind } from "../lib/registry";
import { BatteryRack } from "./BatteryRack";
import { ChargeController, Luminaire, TransformerDry, TransformerOil } from "./Electrical";
import { DcDistribution, GenericEnclosure, PlcCabinet, VfdCabinet } from "./Enclosures";
import { FanBlower } from "./FanBlower";
import { InductionMotor } from "./InductionMotor";
import { Conveyor, ControlValve, HeatExchanger, Instrument, ScrewCompressor, Tank } from "./Process";
import { PumpSet } from "./PumpSet";
import { PvArray } from "./PvArray";
import type { ModelProps } from "./types";

/** Parametric model per kind. Each is built to the footprint declared in lib/registry.ts. */
export const MODEL_COMPONENTS: Record<ModelKind, ComponentType<ModelProps>> = {
  induction_motor: InductionMotor,
  pump_set: PumpSet,
  fan_blower: FanBlower,
  vfd_cabinet: VfdCabinet,
  battery_rack: BatteryRack,
  pv_array: PvArray,
  dc_distribution: DcDistribution,
  charge_controller: ChargeController,
  transformer_dry: TransformerDry,
  transformer_oil: TransformerOil,
  control_valve: ControlValve,
  tank: Tank,
  heat_exchanger: HeatExchanger,
  screw_compressor: ScrewCompressor,
  conveyor: Conveyor,
  luminaire: Luminaire,
  plc_cabinet: PlcCabinet,
  enclosure: GenericEnclosure,
  instrument: Instrument,
};
