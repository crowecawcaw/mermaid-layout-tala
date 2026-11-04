import { describe, expect, it } from "vitest";
import fixtures from "./fixtures/upstream-packing.json";
import { combineComponents } from "../src/packing.js";
describe("upstream disconnected component combination", () => {
  it.each(fixtures)("matches exact Go placements for $name", (fixture) => {
    const components = structuredClone(fixture.components);
    combineComponents(components);
    expect(
      Object.fromEntries(
        components.flatMap((c) =>
          c.nodes.map((n) => [n.id, { x: n.x, y: n.y }]),
        ),
      ),
    ).toEqual(fixture.expected);
  });
});
