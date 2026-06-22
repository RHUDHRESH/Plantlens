import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CommandPalette } from "../CommandPalette";
import type { OperationalSearchResult } from "../searchTypes";

const RESULTS: OperationalSearchResult[] = [
  {
    document: {
      id: "asset:MTR-301",
      kind: "asset",
      title: "Motor",
      subtitle: "MTR-301 · load.motor_3phase · critical",
      assetId: "MTR-301",
      status: "critical",
      tokens: ["motor"],
      aliases: [],
      boost: 60,
    },
    score: 160,
    matchedTokens: ["motor"],
    reason: "token match",
  },
  {
    document: {
      id: "command:fit_plant",
      kind: "command",
      title: "Fit plant",
      subtitle: "Fit map viewport to plant bounds",
      commandId: "fit_plant",
      tokens: ["fit", "plant"],
      aliases: [],
      boost: 5,
    },
    score: 55,
    matchedTokens: [],
    reason: "command",
  },
];

const baseProps = {
  open: true,
  query: "",
  activeIndex: 0,
  results: RESULTS,
  onQueryChange: vi.fn(),
  onClose: vi.fn(),
  onMoveActive: vi.fn(),
  onExecuteResult: vi.fn(),
  onSetActiveIndex: vi.fn(),
};

describe("CommandPalette", () => {
  it("renders input and list", () => {
    render(<CommandPalette {...baseProps} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Motor")).toBeInTheDocument();
  });

  it("query filters via parent results prop", () => {
    const filtered = RESULTS.filter((r) => r.document.title.includes("Fit"));
    render(<CommandPalette {...baseProps} query="fit" results={filtered} />);
    expect(screen.getByText("Fit plant")).toBeInTheDocument();
    expect(screen.queryByText("Motor")).not.toBeInTheDocument();
  });

  it("ArrowDown changes active option", () => {
    const onMoveActive = vi.fn();
    render(<CommandPalette {...baseProps} onMoveActive={onMoveActive} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
    expect(onMoveActive).toHaveBeenCalledWith(1);
  });

  it("Enter executes selected result", () => {
    const onExecute = vi.fn();
    render(<CommandPalette {...baseProps} onExecuteResult={onExecute} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Enter" });
    expect(onExecute).toHaveBeenCalledWith(RESULTS[0]);
  });

  it("Escape closes", () => {
    const onClose = vi.fn();
    render(<CommandPalette {...baseProps} onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("click result executes", () => {
    const onExecute = vi.fn();
    render(<CommandPalette {...baseProps} onExecuteResult={onExecute} />);
    fireEvent.click(screen.getByText("Fit plant"));
    expect(onExecute).toHaveBeenCalledWith(RESULTS[1]);
  });

  it("combobox/listbox aria attributes exist", () => {
    render(<CommandPalette {...baseProps} />);
    const input = screen.getByRole("combobox");
    expect(input).toHaveAttribute("aria-controls");
    expect(input).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("option", { selected: true })).toBeInTheDocument();
  });
});