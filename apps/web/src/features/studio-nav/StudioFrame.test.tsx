import { render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { StudioFrame } from "./StudioFrame";

describe("StudioFrame", () => {
  it("links canvas, forms, HMI preview and components, marking the current one", () => {
    render(
      <MemoryRouter initialEntries={["/eng/studio/forms"]}>
        <StudioFrame>
          <p>body</p>
        </StudioFrame>
      </MemoryRouter>,
    );
    const nav = screen.getByRole("navigation", { name: "Plant Studio views" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/eng/studio",
      "/eng/studio/forms",
      "/eng/studio/hmi-preview",
      "/eng/studio/components",
    ]);
    expect(within(nav).getByRole("link", { name: "Forms" })).toHaveAttribute("aria-current", "page");
    // "Canvas" is /eng/studio exactly; it must not also light up on sub-pages.
    expect(within(nav).getByRole("link", { name: "Canvas" })).not.toHaveAttribute("aria-current");
    expect(screen.getByText("body")).toBeInTheDocument();
  });
});
