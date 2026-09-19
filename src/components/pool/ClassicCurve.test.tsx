import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { classicApply } from "@/lib/classic/constantProduct";
import { ClassicCurve } from "./ClassicCurve";

const classic = [10_000_000, 10_000_000, 10_000_000];

describe("ClassicCurve", () => {
  it("holds the hyperbola still while the dot slides along it", () => {
    const first = classicApply(classic, 0, 1, 6_000_000);
    const { container, rerender } = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={first} />,
    );
    const d1 = container.querySelector("path")!.getAttribute("d");
    const cx1 = container.querySelector('[data-testid="classic-dot"]')!.getAttribute("cx");

    const second = classicApply(classic, 0, 1, 2_000_000);
    rerender(<ClassicCurve i={0} j={1} classic={classic} classicCurrent={second} />);
    const d2 = container.querySelector("path")!.getAttribute("d");
    const cx2 = container.querySelector('[data-testid="classic-dot"]')!.getAttribute("cx");

    expect(d2).toBe(d1);
    expect(cx2).not.toBe(cx1);
  });

  it("draws exactly one curve and no orbital dot", () => {
    const { container, queryByTestId } = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={classic} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(queryByTestId("orbital-dot")).toBeNull();
  });

  it("shows a ghost at the committed point only while previewing", () => {
    const still = render(<ClassicCurve i={0} j={1} classic={classic} classicCurrent={classic} />);
    expect(still.container.querySelectorAll("circle")).toHaveLength(1);
    still.unmount();

    const moving = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={classicApply(classic, 0, 1, 4_000_000)} />,
    );
    expect(moving.container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("keeps every dot inside the viewBox, even far past the sampled range", () => {
    const far = classicApply(classic, 0, 1, 20_000_000); // 3x the committed reserve
    const { container } = render(<ClassicCurve i={0} j={1} classic={classic} classicCurrent={far} />);
    const [, , w, h] = container.querySelector("svg")!.getAttribute("viewBox")!.split(" ").map(Number);
    const dots = container.querySelectorAll("circle");
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      expect(Number(dot.getAttribute("cx"))).toBeGreaterThanOrEqual(0);
      expect(Number(dot.getAttribute("cx"))).toBeLessThanOrEqual(w);
      expect(Number(dot.getAttribute("cy"))).toBeGreaterThanOrEqual(0);
      expect(Number(dot.getAttribute("cy"))).toBeLessThanOrEqual(h);
    });
  });
});
