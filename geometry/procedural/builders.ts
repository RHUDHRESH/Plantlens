/**
 * Procedural geometry builders (Domain A/L) — Three.js primitive composition.
 * Build a motor/pump from cylinders/boxes in code: zero asset files, tiniest
 * payload. Keep each asset small for Raspberry-Pi/kiosk rendering. Real assets
 * can also be CadQuery -> GLB -> Blender decimate -> Draco (see build plan).
 */
import * as THREE from "three";

export interface ProceduralBuilder {
  build(): THREE.Group;
}

export class MotorBuilder implements ProceduralBuilder {
  build(): THREE.Group {
    const g = new THREE.Group();
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24),
      new THREE.MeshStandardMaterial({ color: 0x6b7280 }),
    );
    g.add(body);
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.12, 0.12, 0.6, 16),
      new THREE.MeshStandardMaterial({ color: 0x9ca3af }),
    );
    shaft.position.set(0, 0, 0.8);
    g.add(shaft);
    return g;
  }
}

export class PumpBuilder implements ProceduralBuilder {
  build(): THREE.Group {
    const g = new THREE.Group();
    const volute = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.4, 0.5, 20),
      new THREE.MeshStandardMaterial({ color: 0x6b7280 }),
    );
    g.add(volute);
    return g;
  }
}

export const BUILDERS: Record<string, () => THREE.Group> = {
  motor: () => new MotorBuilder().build(),
  pump: () => new PumpBuilder().build(),
};
