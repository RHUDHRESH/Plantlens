/** Shared fixtures for Studio tests: the real sample library + helpers. */
import library from "../../../../../packages/sample-data/component-library/standard_components.json";
import type { PlantAssembly } from "../../app/schemas/plantAssembly";
import { defaultRuleSet } from "../connection-rules/defaults";
import { buildEngineContext } from "../connection-rules/engine";
import type { RuleComponent } from "../connection-rules/types";
import type { EngineSnapshot } from "./canvas/engineRef";
import type { ComponentTemplate } from "./componentLibraryTypes";
import { addAsset, emptyAssembly } from "./model/assemblyOps";

export const LIBRARY = (library as unknown as { components: ComponentTemplate[] }).components;
export const byType = (id: string) => LIBRARY.find((c) => c.component_type_id === id)!;

export function assemblyWith(types: string[], spacing = 320): PlantAssembly {
  let a = emptyAssembly("demo_microgrid_001");
  types.forEach((t, i) => {
    a = addAsset(a, byType(t), { x: (i % 10) * spacing, y: Math.floor(i / 10) * 240 }).assembly;
  });
  return a;
}

export function snapshotFor(assembly: PlantAssembly, overrides: Partial<EngineSnapshot> = {}): EngineSnapshot {
  return {
    ctx: buildEngineContext(assembly, LIBRARY as unknown as RuleComponent[]),
    rules: defaultRuleSet(),
    reconnectingEdgeId: null,
    readOnly: false,
    ...overrides,
  };
}

/** Minimal DataTransfer for HTML5 drag-and-drop in jsdom. */
export class MockDataTransfer {
  private data = new Map<string, string>();
  dropEffect = "none";
  effectAllowed = "all";
  get types(): string[] {
    return [...this.data.keys()];
  }
  setData(type: string, value: string) {
    this.data.set(type, value);
  }
  getData(type: string) {
    return this.data.get(type) ?? "";
  }
  clearData() {
    this.data.clear();
  }
  setDragImage() {}
}

/** jsdom lacks the geometry APIs xyflow touches. */
export function installFlowDomShims(): void {
  const g = globalThis as unknown as Record<string, unknown>;
  if (!g.DOMMatrixReadOnly) {
    g.DOMMatrixReadOnly = class {
      m22: number;
      constructor(transform?: string) {
        const scale = transform?.match(/scale\(([1-9.])\)/)?.[1];
        this.m22 = scale !== undefined ? Number(scale) : 1;
      }
    };
  }
  const proto = HTMLElement.prototype as unknown as Record<string, unknown>;
  for (const key of ["offsetHeight", "offsetWidth"]) {
    if (!Object.getOwnPropertyDescriptor(proto, key)?.get?.toString().includes("shim")) {
      Object.defineProperty(HTMLElement.prototype, key, {
        configurable: true,
        get: function shim() {
          return key === "offsetHeight" ? 600 : 1000;
        },
      });
    }
  }
  if (!(SVGElement.prototype as unknown as { getBBox?: unknown }).getBBox) {
    (SVGElement.prototype as unknown as { getBBox: () => DOMRect }).getBBox = () => ({ x: 0, y: 0, width: 0, height: 0 }) as DOMRect;
  }
}
