/**
 * Orbit camera with sensible limits and damping, plus 400 ms eased moves for fit / preset /
 * focus / zoom commands (instant when the user prefers reduced motion). Works with
 * frameloop="demand": it invalidates only while a move is in progress.
 */
import { OrbitControls } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useRef, type ElementRef } from "react";
import * as THREE from "three";
import { CAMERA_FOCUS_MS, easeInOutCubic, focusPose, presetPose, type CameraCommand, type CameraPose } from "../lib/camera";
import type { PlantLayout } from "../lib/layout";

type Controls = ElementRef<typeof OrbitControls>;

interface Move {
  fromPos: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toPos: THREE.Vector3;
  toTarget: THREE.Vector3;
  start: number;
}

export function CameraRig({
  layout,
  command,
  selectedId,
  reducedMotion,
  onDistance,
}: {
  layout: PlantLayout;
  command: CameraCommand | null;
  selectedId: string | null;
  reducedMotion: boolean;
  onDistance?: ((distance: number, fitDistance: number) => void) | undefined;
}) {
  const controls = useRef<Controls | null>(null);
  const move = useRef<Move | null>(null);
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera;
  const size = useThree((s) => s.size);
  const invalidate = useThree((s) => s.invalidate);
  const aspect = size.width / Math.max(size.height, 1);
  const fitRef = useRef(10);

  const current = useCallback((): CameraPose => {
    const t = controls.current?.target ?? new THREE.Vector3();
    return { position: camera.position.toArray() as CameraPose["position"], target: t.toArray() as CameraPose["target"] };
  }, [camera]);

  const goTo = useCallback(
    (pose: CameraPose, instant = false) => {
      const c = controls.current;
      if (!c) return;
      if (instant || reducedMotion) {
        camera.position.set(...pose.position);
        c.target.set(...pose.target);
        c.update();
        move.current = null;
      } else {
        move.current = {
          fromPos: camera.position.clone(),
          fromTarget: c.target.clone(),
          toPos: new THREE.Vector3(...pose.position),
          toTarget: new THREE.Vector3(...pose.target),
          start: performance.now(),
        };
      }
      invalidate();
    },
    [camera, reducedMotion, invalidate],
  );

  // Initial framing whenever the layout changes.
  const layoutKey = layout.assets.map((a) => `${a.id}:${a.position.join(",")}`).join("|");
  useEffect(() => {
    const pose = presetPose(layout.bounds, "iso", camera.fov, aspect);
    fitRef.current = Math.hypot(pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]);
    goTo(pose, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey]);

  // Commands from the toolbar.
  useEffect(() => {
    if (!command) return;
    if (command.type === "fit") goTo(presetPose(layout.bounds, "iso", camera.fov, aspect));
    else if (command.type === "preset") goTo(presetPose(layout.bounds, command.preset, camera.fov, aspect));
    else if (command.type === "zoom") {
      const c = current();
      const f = command.factor;
      goTo({
        target: c.target,
        position: [
          c.target[0] + (c.position[0] - c.target[0]) * f,
          c.target[1] + (c.position[1] - c.target[1]) * f,
          c.target[2] + (c.position[2] - c.target[2]) * f,
        ],
      });
    } else if (command.type === "focus") {
      const asset = layout.assets.find((a) => a.id === command.id);
      if (asset) goTo(focusPose(asset, current(), camera.fov, aspect));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command?.nonce]);

  // Focus on select.
  useEffect(() => {
    if (!selectedId) return;
    const asset = layout.assets.find((a) => a.id === selectedId);
    if (asset) goTo(focusPose(asset, current(), camera.fov, aspect));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  useFrame(() => {
    const m = move.current;
    const c = controls.current;
    if (!m || !c) return;
    const t = (performance.now() - m.start) / CAMERA_FOCUS_MS;
    const k = easeInOutCubic(t);
    camera.position.lerpVectors(m.fromPos, m.toPos, k);
    c.target.lerpVectors(m.fromTarget, m.toTarget, k);
    c.update();
    if (t >= 1) move.current = null;
    invalidate();
  });

  const { radius } = { radius: Math.hypot(layout.bounds.max[0] - layout.bounds.min[0], layout.bounds.max[2] - layout.bounds.min[2]) / 2 };

  return (
    <OrbitControls
      ref={controls}
      makeDefault
      enableDamping={!reducedMotion}
      dampingFactor={0.12}
      minDistance={1.2}
      maxDistance={Math.max(12, radius * 5)}
      minPolarAngle={0.05}
      maxPolarAngle={Math.PI / 2 - 0.06}
      zoomSpeed={0.8}
      rotateSpeed={0.6}
      panSpeed={0.8}
      screenSpacePanning
      onChange={() => {
        const c = controls.current;
        if (c && onDistance) onDistance(camera.position.distanceTo(c.target), fitRef.current);
      }}
    />
  );
}
