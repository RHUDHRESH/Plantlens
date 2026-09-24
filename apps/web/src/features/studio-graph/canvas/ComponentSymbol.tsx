import { EquipmentSymbol, sensorLetters, symbolForComponentType } from "../../../components/symbols";
import type { StatusKind } from "../../../components/ui/primitives";

/** EquipmentSymbol for a library component type (sensor bubbles get their ISA-5.1 letters). */
export function ComponentSymbol({ componentTypeId, size, status }: { componentTypeId: string; size: number; status?: StatusKind }) {
  const kind = symbolForComponentType(componentTypeId);
  const tag = kind === "sensor" ? sensorLetters(componentTypeId) : undefined;
  return <EquipmentSymbol kind={kind} size={size} {...(status ? { status } : {})} {...(tag ? { tag } : {})} />;
}
