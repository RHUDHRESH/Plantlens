/**
 * Shared PBR materials for the component library. Industrial, restrained finishes: RAL greys,
 * galvanised and stainless steel, cast iron, copper, aluminium, black anodised, PV glass.
 * Materials are cached (one instance per finish) and disposed with `disposeMaterials()` when the
 * last 3D view unmounts.
 */
import * as THREE from "three";

type Factory = () => THREE.Material;

const cache = new Map<string, THREE.Material>();

function std(color: string, roughness: number, metalness: number, extra: Partial<THREE.MeshStandardMaterialParameters> = {}): Factory {
  return () => new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
}

function phys(params: THREE.MeshPhysicalMaterialParameters): Factory {
  return () => new THREE.MeshPhysicalMaterial(params);
}

const FACTORIES = {
  /** RAL 7035 light grey — enclosures, cabinets */
  paintLight: std("#CDD0CC", 0.52, 0.0),
  /** RAL 7035 slightly darker for door leafs so seams read */
  paintLightDoor: std("#C8CBC7", 0.5, 0.0),
  /** RAL 7016 anthracite — plinths, frames, racks */
  paintDark: std("#3A4045", 0.55, 0.05),
  /** RAL 7031 blue-grey — motors */
  paintMotor: std("#5F6A72", 0.48, 0.12),
  /** RAL 7012 basalt — pump & fan casings (cast iron, painted) */
  paintCasting: std("#4E5559", 0.62, 0.1),
  /** RAL 7037 dust grey — baseplates, supports */
  paintBase: std("#7C7F7E", 0.6, 0.08),
  /** RAL 9006 white aluminium paint — trays, guards */
  paintSilver: std("#A6ABAE", 0.45, 0.55),
  galvanised: std("#A9AEB2", 0.48, 0.82),
  stainless: std("#C3C7CB", 0.28, 1.0),
  castIron: std("#4A4D50", 0.78, 0.45),
  steel: std("#D2D5D8", 0.22, 1.0),
  darkSteel: std("#55595D", 0.4, 0.9),
  copper: std("#C27B4C", 0.3, 1.0),
  brass: std("#B59A5B", 0.35, 1.0),
  aluminium: std("#CBCFD2", 0.36, 1.0),
  aluminiumBrushed: std("#B8BDC1", 0.42, 0.95),
  anodisedBlack: std("#1F2124", 0.42, 0.55),
  plasticBlack: std("#1C1D20", 0.6, 0.0),
  plasticDark: std("#2D3034", 0.55, 0.0),
  plasticGrey: std("#DDDEDA", 0.5, 0.0),
  plasticMid: std("#9A9D9F", 0.5, 0.0),
  rubber: std("#17181A", 0.9, 0.0),
  gap: std("#0B0C0D", 1.0, 0.0),
  concrete: std("#8F8D87", 0.95, 0.0),
  insulator: std("#34363A", 0.35, 0.0),
  porcelain: std("#8F9498", 0.18, 0.0),
  resin: std("#7F878C", 0.35, 0.0),
  laminations: std("#3C3F43", 0.5, 0.7),
  pvGlass: phys({ color: "#FFFFFF", roughness: 0.14, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06 }),
  pvBacksheet: std("#E9EAEA", 0.7, 0.0),
  polycarbonate: phys({
    color: "#D5E0E6",
    roughness: 0.04,
    metalness: 0,
    clearcoat: 1,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    side: THREE.DoubleSide,
  }),
  sightGlass: phys({ color: "#C9D6DC", roughness: 0.05, metalness: 0, transparent: true, opacity: 0.35, depthWrite: false }),
  lensWarm: std("#F4F1E8", 0.25, 0.0, { emissive: "#FFF6E0", emissiveIntensity: 0 }),
  lcd: std("#101618", 0.3, 0.0),
  ledOff: std("#2A2D30", 0.3, 0.0),
} satisfies Record<string, Factory>;

export type MaterialName = keyof typeof FACTORIES;

export function mat(name: MaterialName): THREE.Material {
  let m = cache.get(name);
  if (!m) {
    m = FACTORIES[name]();
    m.name = `pl:${name}`;
    cache.set(name, m);
  }
  return m;
}

/** Per-colour emissive LED / status materials (cached by key). */
export function ledMaterial(color: string, intensity = 1.6): THREE.Material {
  const key = `led:${color}:${intensity}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3, toneMapped: false });
    cache.set(key, m);
  }
  return m;
}

/** Texture-mapped material cached by key (texture factories live in textures.ts). */
export function texturedMaterial(key: string, make: () => THREE.Material): THREE.Material {
  let m = cache.get(key);
  if (!m) {
    m = make();
    cache.set(key, m);
  }
  return m;
}

/** Lamp lens: emissive when running. */
export function lensMaterial(on: boolean): THREE.Material {
  const key = `lens:${on}`;
  let m = cache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color: "#F4F1E8",
      roughness: 0.25,
      emissive: "#FFF4DA",
      emissiveIntensity: on ? 1.1 : 0,
    });
    cache.set(key, m);
  }
  return m;
}

export function disposeMaterials() {
  for (const m of cache.values()) {
    for (const v of Object.values(m)) if (v instanceof THREE.Texture) v.dispose();
    m.dispose();
  }
  cache.clear();
}
