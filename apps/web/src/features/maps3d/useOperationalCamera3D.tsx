import { useCallback, useEffect, useMemo, useRef, useState, type ElementRef } from "react";
import { useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";

type OrbitControlsRef = ElementRef<typeof OrbitControls>;
import type { MapZoomBand } from "../operational-map";
import type { Map3DNode } from "../ops3d/map3dTypes";
import {
  distanceBetweenPoints,
  fitSceneToNodes,
  focusAssetPose3D,
  findNodePosition3D,
  getSceneScaleBand,
  scaleFromDistance,
  type CameraPose3D,
} from "./sceneMath3D";

const TWEEN_MS = 250;
const ZOOM_IN_FACTOR = 0.8;
const ZOOM_OUT_FACTOR = 1.25;

export interface PlantMap3DViewportControls {
  fitPlant: () => void;
  focusRoot: () => void;
  focusAsset: (assetId: string) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  scale: number;
  zoomBand: MapZoomBand;
}

export interface UseOperationalCamera3DOptions {
  nodes: Map3DNode[];
  rootAssetId?: string | null;
  focusAssetId?: string | null;
  reducedMotion?: boolean;
  onZoomBandChange?: (band: MapZoomBand) => void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function useOperationalCamera3D({
  nodes,
  rootAssetId,
  focusAssetId,
  reducedMotion = false,
  onZoomBandChange,
}: UseOperationalCamera3DOptions) {
  const { camera } = useThree();
  const controlsRef = useRef<OrbitControlsRef | null>(null);
  const animationFrameRef = useRef(0);
  const prevFocusAssetId = useRef<string | null | undefined>(undefined);

  const nodesSignature = useMemo(
    () =>
      nodes
        .map((n) => `${n.id}:${n.position?.x ?? ""}:${n.position?.y ?? ""}:${n.position?.z ?? ""}`)
        .join("|"),
    [nodes],
  );

  const sceneFit = useMemo(() => fitSceneToNodes(nodes), [nodesSignature]);
  const fitDistance = sceneFit.cameraPose.distance;

  const readCurrentDistance = useCallback(() => {
    const controls = controlsRef.current;
    if (!controls) return fitDistance;
    return distanceBetweenPoints(
      { x: camera.position.x, y: camera.position.y, z: camera.position.z },
      { x: controls.target.x, y: controls.target.y, z: controls.target.z },
    );
  }, [camera.position.x, camera.position.y, camera.position.z, fitDistance]);

  const [zoomBand, setZoomBand] = useState<MapZoomBand>(() =>
    getSceneScaleBand(sceneFit.cameraPose.distance, fitDistance),
  );
  const [scale, setScale] = useState(() => scaleFromDistance(sceneFit.cameraPose.distance, fitDistance));

  const publishZoomState = useCallback(
    (distance: number) => {
      const nextBand = getSceneScaleBand(distance, fitDistance);
      const nextScale = scaleFromDistance(distance, fitDistance);
      setZoomBand((prev) => {
        if (prev !== nextBand) onZoomBandChange?.(nextBand);
        return nextBand;
      });
      setScale(nextScale);
    },
    [fitDistance, onZoomBandChange],
  );

  const cancelAnimation = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = 0;
    }
  }, []);

  const applyPose = useCallback(
    (pose: CameraPose3D) => {
      const controls = controlsRef.current;
      camera.position.set(pose.position[0], pose.position[1], pose.position[2]);
      if (controls) {
        controls.target.set(pose.target[0], pose.target[1], pose.target[2]);
        controls.update();
      } else {
        camera.lookAt(pose.target[0], pose.target[1], pose.target[2]);
      }
      publishZoomState(pose.distance);
    },
    [camera, publishZoomState],
  );

  const animateToPose = useCallback(
    (pose: CameraPose3D) => {
      cancelAnimation();
      const controls = controlsRef.current;
      const startPos = {
        x: camera.position.x,
        y: camera.position.y,
        z: camera.position.z,
      };
      const startTarget = controls
        ? { x: controls.target.x, y: controls.target.y, z: controls.target.z }
        : { x: pose.target[0], y: pose.target[1], z: pose.target[2] };

      if (reducedMotion) {
        applyPose(pose);
        return;
      }

      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / TWEEN_MS);
        const px = lerp(startPos.x, pose.position[0], t);
        const py = lerp(startPos.y, pose.position[1], t);
        const pz = lerp(startPos.z, pose.position[2], t);
        const tx = lerp(startTarget.x, pose.target[0], t);
        const ty = lerp(startTarget.y, pose.target[1], t);
        const tz = lerp(startTarget.z, pose.target[2], t);

        camera.position.set(px, py, pz);
        if (controls) {
          controls.target.set(tx, ty, tz);
          controls.update();
        } else {
          camera.lookAt(tx, ty, tz);
        }

        const dist = distanceBetweenPoints({ x: px, y: py, z: pz }, { x: tx, y: ty, z: tz });
        publishZoomState(dist);

        if (t < 1) {
          animationFrameRef.current = requestAnimationFrame(tick);
        } else {
          animationFrameRef.current = 0;
        }
      };
      animationFrameRef.current = requestAnimationFrame(tick);
    },
    [camera, reducedMotion, applyPose, cancelAnimation, publishZoomState],
  );

  const fitPlant = useCallback(() => {
    animateToPose(sceneFit.cameraPose);
  }, [animateToPose, sceneFit.cameraPose]);

  const focusAsset = useCallback(
    (assetId: string) => {
      const point = findNodePosition3D(nodes, assetId);
      if (!point) return;
      const pose = focusAssetPose3D(point, sceneFit.radius * 0.45, "asset");
      animateToPose(pose);
    },
    [nodes, sceneFit.radius, animateToPose],
  );

  const focusRoot = useCallback(() => {
    if (!rootAssetId) return;
    const point = findNodePosition3D(nodes, rootAssetId);
    if (!point) return;
    const pose = focusAssetPose3D(point, sceneFit.radius * 0.6, "root");
    animateToPose(pose);
  }, [nodes, rootAssetId, sceneFit.radius, animateToPose]);

  const zoomBy = useCallback(
    (factor: number) => {
      const controls = controlsRef.current;
      if (!controls) return;
      const target = controls.target;
      const dx = camera.position.x - target.x;
      const dy = camera.position.y - target.y;
      const dz = camera.position.z - target.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (!Number.isFinite(dist) || dist <= 0) return;

      const minDistance = Math.max(sceneFit.radius * 0.25, 0.75);
      const maxDistance = Math.max(sceneFit.radius * 5, 14);
      const newDist = Math.max(minDistance, Math.min(maxDistance, dist * factor));
      const ratio = newDist / dist;

      animateToPose({
        target: [target.x, target.y, target.z],
        position: [target.x + dx * ratio, target.y + dy * ratio, target.z + dz * ratio],
        distance: newDist,
      });
    },
    [camera.position.x, camera.position.y, camera.position.z, sceneFit.radius, animateToPose],
  );

  const zoomIn = useCallback(() => zoomBy(ZOOM_IN_FACTOR), [zoomBy]);
  const zoomOut = useCallback(() => zoomBy(ZOOM_OUT_FACTOR), [zoomBy]);

  const controls = useMemo<PlantMap3DViewportControls>(
    () => ({
      fitPlant,
      focusRoot,
      focusAsset,
      zoomIn,
      zoomOut,
      scale,
      zoomBand,
    }),
    [fitPlant, focusRoot, focusAsset, zoomIn, zoomOut, scale, zoomBand],
  );

  useEffect(() => {
    applyPose(sceneFit.cameraPose);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset camera when layout changes
  }, [nodesSignature]);

  useEffect(() => {
    if (focusAssetId === prevFocusAssetId.current) return;
    prevFocusAssetId.current = focusAssetId;
    if (focusAssetId) focusAsset(focusAssetId);
  }, [focusAssetId, focusAsset]);

  useEffect(() => {
    return () => cancelAnimation();
  }, [cancelAnimation]);

  const handleControlsChange = useCallback(() => {
    publishZoomState(readCurrentDistance());
  }, [publishZoomState, readCurrentDistance]);

  return {
    controls,
    controlsRef,
    sceneFit,
    onControlsChange: handleControlsChange,
  };
}