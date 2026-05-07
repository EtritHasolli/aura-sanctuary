import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { CompanionSprite } from "@/components/aura/CompanionSprite";

// Framer-motion animates via rAF which doesn't run in jsdom — stub it out.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    motion: new Proxy(
      {},
      {
        get: (_target, key: string) =>
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ({ children, ...props }: any) =>
            React.createElement(key as string, props, children),
      },
    ),
  };
});

describe("CompanionSprite", () => {
  it("renders an svg for idle state", () => {
    const { container } = render(<CompanionSprite state="idle" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders an svg for working state", () => {
    const { container } = render(<CompanionSprite state="working" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders an svg for sleeping state", () => {
    const { container } = render(<CompanionSprite state="sleeping" />);
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the sleep indicator 'z' when sleeping", () => {
    const { getByText } = render(<CompanionSprite state="sleeping" />);
    expect(getByText("z")).toBeTruthy();
  });

  it("does not render 'z' when idle", () => {
    const { queryByText } = render(<CompanionSprite state="idle" />);
    expect(queryByText("z")).toBeNull();
  });

  it("accepts a custom size prop", () => {
    const { container } = render(<CompanionSprite state="idle" size={32} />);
    const svg = container.querySelector("svg");
    expect(svg?.getAttribute("width")).toBe("32");
    expect(svg?.getAttribute("height")).toBe("32");
  });

  it("renders equipment overlay when gear is provided", () => {
    const { container } = render(
      <CompanionSprite state="idle" gear={[{ slug: "eq-wooden-training-blade", slot: "weapon" }]} />,
    );
    expect(
      container.querySelector('[data-testid="companion-gear-eq-wooden-training-blade"]'),
    ).toBeTruthy();
  });
});
