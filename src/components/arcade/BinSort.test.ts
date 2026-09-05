import { describe, expect, it } from "bun:test";
import { faceGradient, faceHash } from "./BinSort";

// A fake sequel has no poster; its face is drawn from a hash of the anchor
// title, so the same anchor always paints the same card and two anchors
// almost never share one.

describe("faceHash", () => {
  it("is deterministic", () => {
    expect(faceHash("Jaws")).toBe(faceHash("Jaws"));
    expect(faceGradient("Se7en")).toBe(faceGradient("Se7en"));
  });

  it("separates nearby titles", () => {
    const seeds = ["Jaws", "Jaws 2", "Se7en", "Old Yeller", "Titanic", "Heat", "Alien", "Speed"];
    const grounds = new Set(seeds.map(faceGradient));
    expect(grounds.size).toBe(seeds.length);
  });

  it("draws a two-stop hsl gradient", () => {
    const g = faceGradient("The Matrix");
    expect(g.startsWith("linear-gradient(160deg, hsl(")).toBe(true);
    expect(/hsl\(\d+ 58% 34%\), hsl\(\d+ 62% 12%\)\)$/.test(g)).toBe(true);
  });
});
