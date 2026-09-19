import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { createTick, poolRealReserves, quote, type Tick } from "@/lib/orbital";
import { TwoTokenCurve } from "./TwoTokenCurve";

const seed = (): Tick[] => [10, 100, 500, 1000].map((bps) => createTick(`t${bps}`, bps, 2_500_000, 3));

describe("TwoTokenCurve", () => {
  it("keeps both curves fixed while the preview dot moves", () => {
    const committed = seed();
    const classic = poolRealReserves(committed);
    const current1 = quote(committed, 0, 1, 6_000_000).ticks;

    const { container, rerender } = render(
      <TwoTokenCurve committed={committed} current={current1} i={0} j={1} classic={classic} classicCurrent={classic} />,
    );
    const paths1 = container.querySelectorAll("path");
    const solidD1 = paths1[1].getAttribute("d");
    const dashedD1 = paths1[0].getAttribute("d");
    const orbitalDot1 = container.querySelector('[data-testid="orbital-dot"]');
    const cx1 = orbitalDot1?.getAttribute("cx");

    const current2 = quote(committed, 0, 1, 2_000_000).ticks;
    rerender(
      <TwoTokenCurve committed={committed} current={current2} i={0} j={1} classic={classic} classicCurrent={classic} />,
    );
    const paths2 = container.querySelectorAll("path");
    const solidD2 = paths2[1].getAttribute("d");
    const dashedD2 = paths2[0].getAttribute("d");
    const orbitalDot2 = container.querySelector('[data-testid="orbital-dot"]');
    const cx2 = orbitalDot2?.getAttribute("cx");

    expect(solidD2).toBe(solidD1);
    expect(dashedD2).toBe(dashedD1);
    expect(cx2).not.toBe(cx1);
  });

  it("keeps every dot inside the viewBox", () => {
    const committed = seed();
    const classic = poolRealReserves(committed);
    const current = quote(committed, 0, 1, 6_000_000).ticks;
    const classicCurrent = [classic[0] - 1000, classic[1] + 1000, classic[2]];

    const { container } = render(
      <TwoTokenCurve committed={committed} current={current} i={0} j={1} prev={committed} classic={classic} classicCurrent={classicCurrent} />,
    );

    const svg = container.querySelector("svg")!;
    const [, , w, h] = svg.getAttribute("viewBox")!.split(" ").map(Number);
    const dots = container.querySelectorAll("circle");
    expect(dots.length).toBeGreaterThan(0);
    dots.forEach((dot) => {
      const cx = Number(dot.getAttribute("cx"));
      const cy = Number(dot.getAttribute("cy"));
      expect(cx).toBeGreaterThanOrEqual(0);
      expect(cx).toBeLessThanOrEqual(w);
      expect(cy).toBeGreaterThanOrEqual(0);
      expect(cy).toBeLessThanOrEqual(h);
    });
  });
});
