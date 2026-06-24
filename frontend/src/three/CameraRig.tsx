/**
 * CameraRig — Macro/Meso/Micro eased travel via drei <CameraControls>.setLookAt(...,true)
 * (Domain L). No hard cuts. Maps to ISA-101 L1-L4 hierarchy.
 */
import { CameraControls } from "@react-three/drei";
import { useEffect, useRef } from "react";
import { useStore } from "../store/useStore";

const VIEWS: Record<string, [number, number, number, number, number, number]> = {
  macro: [10, 10, 10, 0, 0, 0],
  meso: [4, 4, 4, 0, 0, 0],
  micro: [1.5, 1.2, 1.5, 0, 0, 0],
};

export function CameraRig() {
  const zoom = useStore((s) => s.zoom);
  const ref = useRef<CameraControls>(null);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [px, py, pz, tx, ty, tz] = VIEWS[zoom];
    void c.setLookAt(px, py, pz, tx, ty, tz, true);
  }, [zoom]);

  return <CameraControls ref={ref} />;
}
