import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { classicApply } from "@/lib/classic/constantProduct";
import { ClassicCurve } from "./ClassicCurve";

const classic = [10_000_000, 10_000_000, 10_000_000];
// generous enough to keep every existing scenario's dot well inside the sampled range
const maxFwd = 20_000_000;
const maxBack = 9_000_000;

/** Parses a `path`'s `d` attribute (built from `M`/`L` commands) into its x-coordinates. */
function pathXs(d: string): number[] {
  return d.split(/[ML]/).filter(Boolean).map((seg) => Number(seg.split(",")[0]));
}

describe("ClassicCurve", () => {
  it("holds the hyperbola still while the dot slides along it", () => {
    const first = classicApply(classic, 0, 1, 6_000_000);
    const { container, rerender } = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={first} maxFwd={maxFwd} maxBack={maxBack} />,
    );
    const d1 = container.querySelector("path")!.getAttribute("d");
    const cx1 = container.querySelector('[data-testid="classic-dot"]')!.getAttribute("cx");

    const second = classicApply(classic, 0, 1, 2_000_000);
    rerender(<ClassicCurve i={0} j={1} classic={classic} classicCurrent={second} maxFwd={maxFwd} maxBack={maxBack} />);
    const d2 = container.querySelector("path")!.getAttribute("d");
    const cx2 = container.querySelector('[data-testid="classic-dot"]')!.getAttribute("cx");

    expect(d2).toBe(d1);
    expect(cx2).not.toBe(cx1);
  });

  it("draws exactly one curve and no orbital dot", () => {
    const { container, queryByTestId } = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={classic} maxFwd={maxFwd} maxBack={maxBack} />,
    );
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(queryByTestId("orbital-dot")).toBeNull();
  });

  it("shows a ghost at the committed point only while previewing", () => {
    const still = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={classic} maxFwd={maxFwd} maxBack={maxBack} />,
    );
    expect(still.container.querySelectorAll("circle")).toHaveLength(1);
    still.unmount();

    const moving = render(
      <ClassicCurve
        i={0} j={1} classic={classic}
        classicCurrent={classicApply(classic, 0, 1, 4_000_000)}
        maxFwd={maxFwd} maxBack={maxBack}
      />,
    );
    expect(moving.container.querySelectorAll("circle")).toHaveLength(2);
  });

  it("keeps every dot inside the viewBox, even far past the sampled range", () => {
    const far = classicApply(classic, 0, 1, 20_000_000); // 3x the committed reserve
    const { container } = render(
      <ClassicCurve i={0} j={1} classic={classic} classicCurrent={far} maxFwd={maxFwd} maxBack={maxBack} />,
    );
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

  // Regression: the curve used to be sampled over a fixed [0.55x, 2.2x] multiple of the
  // committed reserve, so after a skewed preview (or a skewed committed state) the moving
  // dot slid off the end of the drawn curve — the dot kept moving, the line didn't reach it.
  // The range is now bounded by how far the committed Orbital ticks could actually move this
  // pair (`maxFwd`/`maxBack`), so it always reaches wherever the dot can land.
  it("keeps the dot within the drawn curve's x-extent after a large skewed preview", () => {
    const committed = [3_000_000, 3_000_000, 3_000_000];
    // 3M committed + 10M in -> reserve of 13M, well past the old fixed 2.2x (6.6M) cap
    const moved = classicApply(committed, 0, 1, 10_000_000);
    expect(moved[0]).toBeCloseTo(13_000_000, 0);

    const { container } = render(
      <ClassicCurve
        i={0} j={1} classic={committed} classicCurrent={moved}
        maxFwd={12_000_000} maxBack={1_000_000}
      />,
    );
    const d = container.querySelector("path")!.getAttribute("d")!;
    const xs = pathXs(d);
    const [xMin, xMax] = [Math.min(...xs), Math.max(...xs)];
    const cx = Number(container.querySelector('[data-testid="classic-dot"]')!.getAttribute("cx"));
    expect(cx).toBeGreaterThanOrEqual(xMin);
    expect(cx).toBeLessThanOrEqual(xMax);
  });
});
