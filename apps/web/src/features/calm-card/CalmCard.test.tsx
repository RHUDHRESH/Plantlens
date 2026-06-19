import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CalmCard, NoActiveSituation } from "./CalmCard";
import { HERO_MOTOR_OVERLOAD } from "../../test-fixtures/heroSnapshot";

describe("CalmCard", () => {
  const card = HERO_MOTOR_OVERLOAD.latest_calm_card!;

  it("renders hero situation fields", () => {
    render(<CalmCard card={card} />);
    expect(screen.getByText(/Motor mechanical overload/i)).toBeInTheDocument();
    expect(screen.getByText(/3-Phase Motor/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/First signal/i)).toHaveTextContent(/Motor current rose first/i);
    expect(screen.getByText(/5 raw alarms grouped/i)).toBeInTheDocument();
    expect(screen.getByText(/Inspect shaft load/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Show evidence & details/i));
    expect(screen.getByText(/Restart inverter/i)).toBeInTheDocument();
    expect(screen.getByText(/Blocked while motor thermal/i)).toBeInTheDocument();
  });

  it("raw alarm disclosure is clickable", () => {
    const onView = vi.fn();
    render(<CalmCard card={card} onViewRawAlarms={onView} />);
    fireEvent.click(screen.getByText(/view raw alarms/i));
    expect(onView).toHaveBeenCalled();
  });

  it("empty state when no situation", () => {
    render(<NoActiveSituation />);
    expect(screen.getByText(/All clear/i)).toBeInTheDocument();
  });
});