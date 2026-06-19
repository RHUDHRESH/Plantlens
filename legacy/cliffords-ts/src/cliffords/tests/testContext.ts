import type {
  CliffordContext,
  Clock,
  IdProvider
} from "../contracts/plantModel.js";
import { DEFAULT_CLIFFORD_CONFIG } from "../runtime.js";
import { createMemoryStores } from "../stores/index.js";

export function fixedClock(
  value = "2026-06-15T12:00:00.000Z"
): Clock {
  return {
    now: () => new Date(value)
  };
}

export function sequentialIds(): IdProvider {
  let sequence = 0;
  return {
    next: (prefix) => `${prefix}_${++sequence}`
  };
}

export function createTestContext(): {
  context: CliffordContext;
  stores: ReturnType<typeof createMemoryStores>;
} {
  const stores = createMemoryStores();
  const context: CliffordContext = {
    plant_timezone: "Asia/Kolkata",
    tag_registry: {
      PV101_IRRADIANCE_LOW: {
        id: "PV101_IRRADIANCE_LOW",
        equipment_id: "PV-101",
        zone_id: "ZONE-PV",
        signal_type: "irradiance",
        engineering_unit: "W/m2"
      },
      PV101_CURRENT_LOW: {
        id: "PV101_CURRENT_LOW",
        equipment_id: "PV-101",
        zone_id: "ZONE-PV",
        signal_type: "current",
        engineering_unit: "A"
      },
      MPPT101_POWER_LIMIT: {
        id: "MPPT101_POWER_LIMIT",
        equipment_id: "MPPT-101",
        zone_id: "ZONE-POWER",
        signal_type: "power_percent",
        engineering_unit: "%"
      },
      BAT101_DISCHARGE_HIGH: {
        id: "BAT101_DISCHARGE_HIGH",
        equipment_id: "BAT-101",
        zone_id: "ZONE-POWER",
        signal_type: "current",
        engineering_unit: "A"
      },
      DCBUS101_VOLTAGE_LOW: {
        id: "DCBUS101_VOLTAGE_LOW",
        equipment_id: "DCBUS-101",
        zone_id: "ZONE-POWER",
        signal_type: "voltage",
        engineering_unit: "V"
      }
    },
    equipment_registry: {
      "PV-101": {
        id: "PV-101",
        zone_id: "ZONE-PV",
        archetype_id: "GENERIC-SOURCE"
      },
      "MPPT-101": {
        id: "MPPT-101",
        zone_id: "ZONE-POWER",
        archetype_id: "GENERIC-CONTROLLER"
      },
      "BAT-101": {
        id: "BAT-101",
        zone_id: "ZONE-POWER",
        archetype_id: "GENERIC-STORAGE"
      },
      "DCBUS-101": {
        id: "DCBUS-101",
        zone_id: "ZONE-POWER",
        archetype_id: "GENERIC-BUS"
      }
    },
    zone_registry: {
      "ZONE-PV": { id: "ZONE-PV" },
      "ZONE-POWER": { id: "ZONE-POWER" }
    },
    archetype_library: {
      "GENERIC-SOURCE": {
        id: "GENERIC-SOURCE",
        signal_types: ["irradiance", "current"]
      },
      "GENERIC-CONTROLLER": {
        id: "GENERIC-CONTROLLER",
        signal_types: ["power_percent"]
      },
      "GENERIC-STORAGE": {
        id: "GENERIC-STORAGE",
        signal_types: ["current"]
      },
      "GENERIC-BUS": {
        id: "GENERIC-BUS",
        signal_types: ["voltage"]
      }
    },
    config: {
      ...DEFAULT_CLIFFORD_CONFIG,
      signal_rules: {
        irradiance: {
          allowed_units: ["W/m2"],
          min_value: 0,
          max_value: 2000
        },
        current: {
          allowed_units: ["A"],
          min_value: -10000,
          max_value: 10000
        },
        power_percent: {
          allowed_units: ["%"],
          min_value: 0,
          max_value: 100
        },
        voltage: {
          allowed_units: ["V"],
          min_value: 0,
          max_value: 1000000
        }
      }
    },
    stores,
    clock: fixedClock(),
    ids: sequentialIds()
  };
  return { context, stores };
}
