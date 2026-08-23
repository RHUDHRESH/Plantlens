/** Static 21-signal register map from docs/REGISTER_BIBLE (commissioning reference). */

export interface RegisterBibleEntry {
  index: number;
  signal: string;
  tagId: string;
  address: string;
  dataType: string;
  scale: number;
  assetId: string;
}

/** Canonical bench map — static OK when live gateway health is missing. */
export const REGISTER_BIBLE_ENTRIES: RegisterBibleEntry[] = [
  { index: 1, signal: "SOLAR_VOLT", tagId: "PV_101_V", address: "0–1", dataType: "float32", scale: 1, assetId: "PV-101" },
  { index: 2, signal: "SOLAR_CURR", tagId: "PV_101_I", address: "2–3", dataType: "float32", scale: 1, assetId: "PV-101" },
  { index: 3, signal: "SOLAR_PWR", tagId: "PV_101_W", address: "4–5", dataType: "float32", scale: 1, assetId: "PV-101" },
  { index: 4, signal: "MAINS_VOLT", tagId: "MAINS_V", address: "6–7", dataType: "float32", scale: 1, assetId: "BUS-101" },
  { index: 5, signal: "MAINS_CURR", tagId: "MAINS_I", address: "8–9", dataType: "float32", scale: 1, assetId: "BUS-101" },
  { index: 6, signal: "MAINS_PWR", tagId: "MAINS_W", address: "10–11", dataType: "float32", scale: 1, assetId: "BUS-101" },
  { index: 7, signal: "BAT_VOLT", tagId: "BAT_101_V", address: "12–13", dataType: "float32", scale: 1, assetId: "BAT-101" },
  { index: 8, signal: "BAT_CURR", tagId: "BAT_101_I", address: "14–15", dataType: "float32", scale: 1, assetId: "BAT-101" },
  { index: 9, signal: "BAT_PWR", tagId: "BAT_101_W", address: "16–17", dataType: "float32", scale: 1, assetId: "BAT-101" },
  { index: 10, signal: "INV_VOLT", tagId: "INV_102_V", address: "18–19", dataType: "float32", scale: 1, assetId: "INV-102" },
  { index: 11, signal: "INV_CURR", tagId: "INV_102_I", address: "20–21", dataType: "float32", scale: 1, assetId: "INV-102" },
  { index: 12, signal: "INV_PWR", tagId: "INV_102_W", address: "22–23", dataType: "float32", scale: 1, assetId: "INV-102" },
  { index: 13, signal: "VFD_VOLT", tagId: "VFD_V", address: "24", dataType: "int16", scale: 1, assetId: "INV-102" },
  { index: 14, signal: "VFD_CURR", tagId: "VFD_I", address: "26", dataType: "int16", scale: 0.01, assetId: "MTR-301" },
  { index: 15, signal: "VFD_PWR", tagId: "VFD_W", address: "28", dataType: "int16", scale: 0.01, assetId: "INV-102" },
  { index: 16, signal: "VIB_TEMP", tagId: "VIB_TEMP", address: "30", dataType: "int16", scale: 0.1, assetId: "MTR-301" },
  { index: 17, signal: "VIB_X", tagId: "VIB_X", address: "32", dataType: "int16", scale: 1, assetId: "MTR-301" },
  { index: 18, signal: "VIB_Y", tagId: "VIB_Y", address: "34", dataType: "int16", scale: 1, assetId: "MTR-301" },
  { index: 19, signal: "VIB_Z", tagId: "VIB_Z", address: "36", dataType: "int16", scale: 1, assetId: "MTR-301" },
  { index: 20, signal: "MOTOR_RPM", tagId: "MOTOR_301_RPM", address: "38", dataType: "int16", scale: 1, assetId: "MTR-301" },
  { index: 21, signal: "MOTOR_TEMP", tagId: "MOTOR_301_TEMP", address: "40", dataType: "int16", scale: 1, assetId: "MTR-301" },
];
