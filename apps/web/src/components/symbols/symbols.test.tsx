import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  EquipmentBadge,
  EquipmentSymbol,
  SYMBOL_KINDS,
  SYMBOL_META,
  isAbnormalStatus,
  sensorLetters,
  symbolForAssetType,
  symbolForComponentType,
  symbolGeometry,
  type SymbolKind,
  type SymbolPrim,
} from "./index";

const ALL: SymbolKind[] = [...SYMBOL_KINDS];

function flatten(prims: SymbolPrim[]): SymbolPrim[] {
  return prims.flatMap((p) => (p.t === "g" ? flatten(p.children) : [p]));
}

describe("EquipmentSymbol", () => {
  it.each(ALL)("%s renders a titled svg with role img and drawn geometry", (kind) => {
    const { container } = render(<EquipmentSymbol kind={kind} title={`${kind} symbol`} tag="TT" />);
    const svg = screen.getByRole("img", { name: `${kind} symbol` });
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(svg).toHaveAttribute("viewBox", "0 0 48 48");
    const g = container.querySelector(`g.pl-sym[data-symbol="${kind}"]`);
    expect(g).not.toBeNull();
    expect(g!.querySelectorAll("path, circle, rect, ellipse").length).toBeGreaterThan(0);
  });

  it("is decorative (aria-hidden) without a title", () => {
    const { container } = render(<EquipmentSymbol kind="motor" />);
    const svg = container.querySelector("svg")!;
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg).not.toHaveAttribute("role");
  });

  it("every kind has a distinct glyph", () => {
    const sigs = ALL.map((k) => JSON.stringify(symbolGeometry(k, { tag: "TT" })));
    expect(new Set(sigs).size).toBe(ALL.length);
  });

  it("uses only token classes, never inline colours", () => {
    for (const kind of ALL) {
      const { container, unmount } = render(<EquipmentSymbol kind={kind} state="running" tag="PT" />);
      const html = container.innerHTML;
      expect(html).not.toMatch(/(fill|stroke)="(#|rgb|hsl|red|black|white)/i);
      expect(html).not.toMatch(/style="/);
      unmount();
    }
  });

  it("running fills the body; stopped/unknown keep the outline look", () => {
    const running = render(<EquipmentSymbol kind="motor" state="running" />).container;
    const stopped = render(<EquipmentSymbol kind="motor" state="stopped" />).container;
    const unknown = render(<EquipmentSymbol kind="motor" />).container;
    expect(running.querySelector("svg")).toHaveClass("pl-symbol--running");
    expect(stopped.querySelector("svg")).toHaveClass("pl-symbol--stopped");
    expect(unknown.querySelector("svg")).toHaveClass("pl-symbol--unknown");
    expect(running.querySelectorAll(".pl-sym-fill-on").length).toBeGreaterThan(0);
    expect(stopped.querySelectorAll(".pl-sym-fill-on").length).toBe(0);
    expect(unknown.querySelectorAll(".pl-sym-fill-on").length).toBe(0);
  });

  it("every kind with a body changes between running and stopped", () => {
    for (const kind of ALL) {
      const hasBody = flatten(symbolGeometry(kind)).some((p) => "paint" in p && (p.paint === "body" || p.paint === "hub"));
      if (!hasBody) continue;
      const a = render(<EquipmentSymbol kind={kind} state="running" />);
      const b = render(<EquipmentSymbol kind={kind} state="stopped" />);
      expect(a.container.innerHTML.replace("pl-symbol--running", "")).not.toBe(b.container.innerHTML.replace("pl-symbol--stopped", ""));
      a.unmount();
      b.unmount();
    }
  });

  it("rotating equipment shows a solid running indicator", () => {
    const { container } = render(<EquipmentSymbol kind="fan" state="running" />);
    expect(container.querySelectorAll(".pl-sym-solid").length).toBeGreaterThan(0);
    const stopped = render(<EquipmentSymbol kind="fan" state="stopped" />).container;
    expect(stopped.querySelectorAll(".pl-sym-solid").length).toBe(0);
  });

  it("lamp rays only appear when running", () => {
    const on = render(<EquipmentSymbol kind="lamp" state="running" />).container;
    const off = render(<EquipmentSymbol kind="lamp" state="stopped" />).container;
    expect(on.querySelectorAll("path").length).toBe(off.querySelectorAll("path").length + 1);
  });

  it("applies the status wrapper class", () => {
    const { container } = render(<EquipmentSymbol kind="pump_centrifugal" status="critical" />);
    expect(container.querySelector("svg")).toHaveClass("pl-symbol", "pl-symbol--critical");
  });

  it("sensor draws ISA-5.1 letters from tag, '?' when missing, and a panel line when panel-mounted", () => {
    const { container, rerender } = render(<EquipmentSymbol kind="sensor" tag="pt" />);
    expect(container.querySelector("text")).toHaveTextContent("PT");
    rerender(<EquipmentSymbol kind="sensor" />);
    expect(container.querySelector("text")).toHaveTextContent("?");
    const field = container.querySelectorAll("path").length;
    rerender(<EquipmentSymbol kind="sensor" tag="PI" mounting="panel" />);
    expect(container.querySelectorAll("path").length).toBe(field + 1);
  });

  it("falls back to generic for an unknown kind", () => {
    const { container } = render(<EquipmentSymbol kind={"nope" as SymbolKind} />);
    expect(container.querySelector("g.pl-sym")).not.toBeNull();
  });

  it("badge prop draws the priority glyph only when abnormal", () => {
    const normal = render(<EquipmentSymbol kind="motor" badge />).container;
    expect(normal.querySelector(".pl-sym-badge-svg")).toBeNull();
    const crit = render(<EquipmentSymbol kind="motor" status="critical" badge />).container;
    expect(crit.querySelector(".pl-sym-badge-svg .pl-glyph--critical")).not.toBeNull();
  });
});

describe("EquipmentBadge", () => {
  it("renders nothing for normal status", () => {
    const { container } = render(<EquipmentBadge status="normal" />);
    expect(container.innerHTML).toBe("");
    expect(isAbnormalStatus("normal")).toBe(false);
    expect(isAbnormalStatus(undefined)).toBe(false);
    expect(isAbnormalStatus("sensor_bad")).toBe(true);
  });

  it("renders a labelled shape glyph for abnormal status (html and svg modes)", () => {
    render(<EquipmentBadge status="high" />);
    expect(screen.getByRole("img", { name: "High" })).toHaveClass("pl-glyph--high");
    const { container } = render(
      <svg>
        <EquipmentBadge status="offline" mode="svg" x={40} y={8} />
      </svg>,
    );
    const g = container.querySelector("g.pl-sym-badge-svg")!;
    expect(g).toHaveAttribute("transform", "translate(40 8)");
    expect(g.querySelector(".pl-glyph--offline")).not.toBeNull();
  });
});

describe("mappings", () => {
  it("symbolForAssetType maps plant asset types and falls back to generic", () => {
    expect(symbolForAssetType("source.solar")).toBe("pv_array");
    expect(symbolForAssetType("distribution.dc_bus")).toBe("busbar");
    expect(symbolForAssetType("drive.inverter")).toBe("vfd");
    expect(symbolForAssetType("load.motor_3phase")).toBe("motor");
    expect(symbolForAssetType("sensor.rpm")).toBe("sensor");
    expect(symbolForAssetType("control.hmi")).toBe("hmi");
    expect(symbolForAssetType("unknown.thing")).toBe("generic");
    expect(symbolForAssetType(null)).toBe("generic");
    expect(symbolForAssetType(undefined)).toBe("generic");
  });

  it("symbolForComponentType maps library component types and falls back to generic", () => {
    expect(symbolForComponentType("dc_motor_12v")).toBe("dc_motor");
    expect(symbolForComponentType("pump")).toBe("pump_centrifugal");
    expect(symbolForComponentType("solenoid_valve")).toBe("valve_solenoid");
    expect(symbolForComponentType("relay_contactor")).toBe("contactor");
    expect(symbolForComponentType("plc_analog_input_module")).toBe("plc_io");
    expect(symbolForComponentType("pressure_sensor")).toBe("sensor");
    expect(symbolForComponentType("mystery")).toBe("generic");
  });

  it("every mapped symbol is a real kind", () => {
    for (const t of ["source.solar", "source.mains", "storage.battery", "distribution.breaker", "control.plc"]) {
      expect(SYMBOL_KINDS).toContain(symbolForAssetType(t));
    }
  });

  it("sensorLetters gives ISA-5.1 letters", () => {
    expect(sensorLetters("temperature_sensor")).toBe("TT");
    expect(sensorLetters("current_sensor")).toBe("IT");
    expect(sensorLetters("voltage_sensor")).toBe("ET");
    expect(sensorLetters("rpm_tachometer")).toBe("ST");
    expect(sensorLetters("vibration_sensor")).toBe("VT");
    expect(sensorLetters("airflow_sensor")).toBe("FT");
    expect(sensorLetters("pressure_sensor")).toBe("PT");
    expect(sensorLetters("limit_switch")).toBe("ZS");
    expect(sensorLetters("sensor.temperature")).toBe("TT");
    expect(sensorLetters("pump")).toBeUndefined();
    expect(sensorLetters(null)).toBeUndefined();
  });
});

describe("SYMBOL_META", () => {
  it("covers every kind with a label and a valid category", () => {
    const cats = new Set(["electrical", "rotating", "process", "control", "instrument", "structural"]);
    expect(Object.keys(SYMBOL_META).sort()).toEqual([...ALL].sort());
    for (const kind of ALL) {
      expect(SYMBOL_META[kind].label.length).toBeGreaterThan(0);
      expect(cats.has(SYMBOL_META[kind].category)).toBe(true);
    }
  });

  it("SYMBOL_KINDS has no duplicates", () => {
    expect(new Set(ALL).size).toBe(ALL.length);
  });
});
